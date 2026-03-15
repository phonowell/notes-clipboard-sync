import { fetchNotes } from './notes.js'
import {
  clearClipboardIfUnchanged,
  type ClipboardState,
  writeClipboard,
} from './clipboard.js'
import { parseCliConfig } from './config.js'
import {
  checkAccessibilityPermission,
  checkPermissions,
  formatAccessibilityGuidance,
  formatNotesGuidance,
} from './permissions.js'
import { createState, loadState, saveState } from './state.js'
import { diffNotes, formatClipboardText } from './sync.js'
import { sendNotification } from './notification.js'
import { createPasteShortcutListener } from './paste-listener.js'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const CONSUME_CLEAR_DELAY_MS = 250

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
  if (!text) return null

  const state = await writeClipboard(text)
  printResult('clipboard', {
    bytes: text.length,
    changeCount: state.changeCount,
    status: 'updated',
  })
  return state
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
  promptAccessibility: boolean,
  requireAccessibility: boolean,
) => {
  const permissions = await printPermissions(account)
  if (permissions.notes.status !== 'granted') {
    throw new Error(formatNotesGuidance(permissions.notes.detail))
  }

  let accessibilityStatus = permissions.accessibility
  if (promptAccessibility && accessibilityStatus.status !== 'granted') {
    accessibilityStatus = await checkAccessibilityPermission(true)
    printResult('permission', {
      accessibility: accessibilityStatus.status,
    })
    printResult('permission-detail', {
      accessibility: accessibilityStatus.detail,
    })
  }

  if (requireAccessibility && accessibilityStatus.status !== 'granted') {
    throw new Error(formatAccessibilityGuidance(accessibilityStatus.detail))
  }

  const previousState = await loadState(statePath)
  if (!previousState) {
    await runInit(account, statePath)
  }

  let activeClipboard: ClipboardState | null = null
  let bufferedClipboard = ''
  let flushTimer: NodeJS.Timeout | null = null
  let consumeTimer: NodeJS.Timeout | null = null
  let pasteConsumeStatus = accessibilityStatus
  const listener = createPasteShortcutListener(async () => {
    if (!activeClipboard) return
    const consumedClipboard = activeClipboard
    activeClipboard = null

    if (consumeTimer) clearTimeout(consumeTimer)
    consumeTimer = setTimeout(async () => {
      consumeTimer = null

      try {
        const result = await clearClipboardIfUnchanged(consumedClipboard)
        printResult('consume', { status: result.matched ? 'consumed' : 'skipped' })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        printResult('error', { message })
      }
    }, CONSUME_CLEAR_DELAY_MS)
  })

  if (accessibilityStatus.status === 'granted') {
    pasteConsumeStatus = await listener.start()
  }

  if (requireAccessibility && pasteConsumeStatus.status !== 'granted') {
    throw new Error(formatAccessibilityGuidance(pasteConsumeStatus.detail))
  }

  printResult('watch', {
    debounceSeconds,
    intervalSeconds,
    state: statePath,
  })

  if (pasteConsumeStatus.status === 'granted') {
    printResult('watch-mode', {
      pasteConsume: 'enabled',
    })
  } else {
    printResult('watch-mode', {
      pasteConsume: 'disabled',
      reason: pasteConsumeStatus.detail,
      status: pasteConsumeStatus.status,
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
          ? `${activeClipboard.text}${text}`
          : text
        activeClipboard = await flushClipboard(nextClipboard)
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
          ? `${bufferedClipboard}${result.clipboardText}`
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
      config.promptAccessibility,
      config.requireAccessibility,
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
