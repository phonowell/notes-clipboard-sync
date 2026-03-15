import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'

import type { PermissionStatus } from './permissions.js'

const currentDir = dirname(fileURLToPath(import.meta.url))
const helperPath = join(currentDir, '..', 'tools', 'paste-listener.swift')

export const createPasteShortcutListener = (onPaste: () => void) => {
  let child: ReturnType<typeof spawn> | null = null

  return {
    start: async (): Promise<PermissionStatus> => {
      child = spawn('swift', [helperPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      if (!child.stdout || !child.stderr) {
        throw new Error('paste-listener stdio unavailable')
      }

      const stdout = createInterface({ input: child.stdout })
      let permissionStatus: PermissionStatus = 'unavailable'

      stdout.on('line', (line) => {
        if (line === 'event=paste-shortcut') onPaste()
        if (line === 'trusted=true') {
          permissionStatus = 'granted'
        }
        if (line === 'permission=denied') {
          permissionStatus = 'denied'
          console.log('paste-listener permission=denied')
        }
      })

      child.stderr.on('data', (chunk) => {
        const message = chunk.toString().trim()
        if (message) console.error(message)
      })

      child.on('exit', (code) => {
        console.log(`paste-listener exit=${code ?? -1}`)
      })

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 200)
      })

      return permissionStatus
    },
  }
}
