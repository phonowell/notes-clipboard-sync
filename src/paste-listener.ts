import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'

import type { PermissionCheck } from './permissions.js'

const currentDir = dirname(fileURLToPath(import.meta.url))
const helperPath = join(currentDir, '..', 'tools', 'paste-listener.swift')
const STARTUP_TIMEOUT_MS = 2_000

export const createPasteShortcutListener = (
  onPaste: () => void | Promise<void>,
) => {
  let child: ReturnType<typeof spawn> | null = null

  return {
    start: async (): Promise<PermissionCheck> =>
      new Promise<PermissionCheck>((resolve) => {
        child = spawn('swift', [helperPath], {
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        if (!child.stdout || !child.stderr) {
          resolve({
            detail: 'paste-listener stdio unavailable',
            status: 'unavailable',
          })
          return
        }

        const stdout = createInterface({ input: child.stdout })
        let startupResolved = false
        let stderrOutput = ''

        const finalize = (result: PermissionCheck) => {
          if (startupResolved) return
          startupResolved = true
          clearTimeout(startupTimeout)
          resolve(result)
        }

        const startupTimeout = setTimeout(() => {
          finalize({
            detail: 'paste shortcut listener startup timed out',
            status: 'unavailable',
          })
        }, STARTUP_TIMEOUT_MS)

        stdout.on('line', (line) => {
          if (line === 'event=paste-shortcut') {
            Promise.resolve(onPaste()).catch((error) => {
              const message =
                error instanceof Error ? error.message : String(error)
              console.error(message)
            })
            return
          }

          if (line === 'permission=denied') {
            finalize({
              detail: 'Accessibility denied',
              status: 'denied',
            })
            return
          }

          if (line === 'monitor=unavailable') {
            finalize({
              detail: 'global key monitor unavailable',
              status: 'unavailable',
            })
            return
          }

          if (line === 'listener=ready') {
            finalize({
              detail: 'paste shortcut listener ready',
              status: 'granted',
            })
          }
        })

        child.stderr.on('data', (chunk) => {
          const message = chunk.toString().trim()
          if (!message) return
          stderrOutput = stderrOutput
            ? `${stderrOutput}\n${message}`
            : message
          console.error(message)
        })

        child.on('exit', (code) => {
          if (!startupResolved) {
            finalize({
              detail: stderrOutput || `paste-listener exited with code ${code ?? -1}`,
              status: 'unavailable',
            })
            return
          }

          if (code !== 0) {
            console.log(`paste-listener exit=${code ?? -1}`)
          }
        })
      }),
  }
}
