import { fetchNotes } from './notes.js'
import { writeClipboard } from './clipboard.js'
import { parseCliConfig } from './config.js'
import { checkPermissions } from './permissions.js'
import { createState, loadState, saveState } from './state.js'
import { diffNotes, formatClipboardText } from './sync.js'
import { sendNotification } from './notification.js'
import { createPasteShortcutListener } from './paste-listener.js'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const printResult = (label: string, values: Record<string, string | number>) => {
  const output = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
  console.log(`${label} ${output}`.trim())
}

const printPermissions = async (account: string) => {
  const permissions = await checkPermissions(account)

  printResult('permission', {
    accessibility: permissions.accessibility.status,
    notes: permissions.notes.status,
  })

  printResult('permission-detail', {
    accessibility: permissions.accessibility.detail,
    notes: permissions.notes.detail,
  })

  return permissions
}

const runInit = async (account: string, statePath: string) => {
  const { account: resolvedAccount, notes } = await fetchNotes(account)
  await saveState(statePath, createState(notes))

  printResult('init', {
    account: resolvedAccount,
    notes: notes.length,
    state: statePath,
  })
}

type PollResult = {
  clipboardText: string
  conflictCount: number
  deltaCount: number
  noteCount: number
  resolvedAccount: string
}

const flushClipboard = async (text: string) => {
  if (!text) return
  await writeClipboard(text)
  printResult('clipboard', {
    bytes: text.length,
    status: 'updated',
  })
}

const runOnce = async (
  account: string,
  statePath: string,
): Promise<PollResult | null> => {
  const previousState = await loadState(statePath)
  if (!previousState) {
    await runInit(account, statePath)
    console.log('hint run `pnpm notes once` after new notes arrive')
    return null
  }

  const { account: resolvedAccount, notes } = await fetchNotes(account)
  const result = diffNotes(previousState.notes, notes)
  const clipboardText = formatClipboardText(result.deltas)

  await saveState(statePath, result.nextState)

  if (clipboardText || result.conflicts.length > 0) {
    printResult('once', {
      account: resolvedAccount,
      clipboard: clipboardText ? 'updated' : 'unchanged',
      conflicts: result.conflicts.length,
      deltas: result.deltas.length,
      notes: notes.length,
    })
  }

  for (const conflict of result.conflicts) {
    printResult('conflict', {
      currentLength: conflict.currentLength,
      noteId: conflict.noteId,
      previousLength: conflict.previousLength,
      title: conflict.title,
    })
  }

  return {
    clipboardText,
    conflictCount: result.conflicts.length,
    deltaCount: result.deltas.length,
    noteCount: notes.length,
    resolvedAccount,
  }
}

const runWatch = async (
  account: string,
  statePath: string,
  intervalSeconds: number,
  debounceSeconds: number,
) => {
  const permissions = await printPermissions(account)
  if (permissions.notes.status !== 'granted') {
    throw new Error(`Notes permission unavailable: ${permissions.notes.detail}`)
  }

  const previousState = await loadState(statePath)
  if (!previousState) {
    await runInit(account, statePath)
  }

  printResult('watch', {
    debounceSeconds,
    intervalSeconds,
    state: statePath,
  })

  let activeClipboard = ''
  let bufferedClipboard = ''
  let flushTimer: NodeJS.Timeout | null = null
  let accessibilityEnabled = permissions.accessibility.status === 'granted'
  const listener = createPasteShortcutListener(() => {
    if (!activeClipboard) return
    activeClipboard = ''
    printResult('consume', { status: 'consumed' })
  })

  if (accessibilityEnabled) {
    const listenerStatus = await listener.start()
    accessibilityEnabled = listenerStatus === 'granted'
  }

  if (!accessibilityEnabled) {
    printResult('watch-mode', {
      pasteConsume: 'disabled',
      reason: 'accessibility-denied',
    })
  }

  const scheduleFlush = () => {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(async () => {
      const text = bufferedClipboard
      bufferedClipboard = ''
      flushTimer = null

      try {
        const nextClipboard = activeClipboard
          ? `${activeClipboard}\n\n${text}`
          : text
        await flushClipboard(nextClipboard)
        activeClipboard = nextClipboard
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        printResult('error', { message })
      }
    }, debounceSeconds * 1000)
  }

  while (true) {
    try {
      const result = await runOnce(account, statePath)
      if (result?.clipboardText) {
        bufferedClipboard = bufferedClipboard
          ? `${bufferedClipboard}\n\n${result.clipboardText}`
          : result.clipboardText

        const notificationMessage = [
          `deltas=${result.deltaCount}`,
          `conflicts=${result.conflictCount}`,
          `notes=${result.noteCount}`,
        ].join(' ')

        await sendNotification('Notes Clipboard Sync', notificationMessage)
        scheduleFlush()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      printResult('error', { message })
    }

    await sleep(intervalSeconds * 1000)
  }
}

const main = async () => {
  const config = parseCliConfig(process.argv.slice(2))

  if (config.command === 'init') {
    await runInit(config.account, config.statePath)
    return
  }

  if (config.command === 'watch') {
    await runWatch(
      config.account,
      config.statePath,
      config.intervalSeconds,
      config.debounceSeconds,
    )
    return
  }

  if (config.command === 'permissions') {
    await printPermissions(config.account)
    return
  }

  const result = await runOnce(config.account, config.statePath)
  if (result?.clipboardText) {
    await flushClipboard(result.clipboardText)
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
