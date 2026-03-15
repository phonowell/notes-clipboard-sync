import { spawn } from 'node:child_process'

export const writeClipboard = async (text: string) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn('pbcopy')
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`pbcopy exited with code ${code ?? -1}`))
    })
    child.stdin.end(text)
  })
