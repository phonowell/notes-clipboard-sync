import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const helperPath = join(currentDir, '..', 'tools', 'clipboard-helper.swift')

export type ClipboardState = {
  changeCount: number
  text: string
}

type ClipboardClearResult = {
  afterChangeCount: number
  beforeChangeCount: number
  beforeTextLength: number
  matched: boolean
}

const logClipboard = (
  label: string,
  values: Record<string, boolean | number | string>,
) => {
  const output = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
  console.log(`${label} ${output}`.trim())
}

const runClipboardHelper = async (command: string, input = '', args: string[] = []) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn('swift', [helperPath, command, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.on('error', reject)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
        return
      }

      const message = stderr.trim() || `clipboard helper exited with code ${code ?? -1}`
      reject(new Error(message))
    })

    child.stdin.end(input)
  })

export const readClipboardState = async (): Promise<ClipboardState> => {
  const stdout = await runClipboardHelper('read')
  const state = JSON.parse(stdout) as ClipboardState
  logClipboard('clipboard-read', {
    bytes: state.text.length,
    changeCount: state.changeCount,
  })
  return state
}

export const writeClipboard = async (text: string): Promise<ClipboardState> => {
  const stdout = await runClipboardHelper('write', text)
  const state = JSON.parse(stdout) as ClipboardState
  logClipboard('clipboard-write', {
    bytes: text.length,
    changeCount: state.changeCount,
  })
  return state
}

export const clearClipboardIfUnchanged = async (
  expected: ClipboardState,
): Promise<ClipboardClearResult> => {
  const stdout = await runClipboardHelper(
    'clear-if-match',
    expected.text,
    [String(expected.changeCount)],
  )
  const result = JSON.parse(stdout) as ClipboardClearResult

  logClipboard('clipboard-clear', result.matched
    ? {
        afterChangeCount: result.afterChangeCount,
        beforeChangeCount: result.beforeChangeCount,
        bytes: expected.text.length,
        status: 'cleared',
      }
    : {
        currentChangeCount: result.beforeChangeCount,
        currentBytes: result.beforeTextLength,
        expectedChangeCount: expected.changeCount,
        expectedBytes: expected.text.length,
        status: 'skipped',
      })

  return result
}
