import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { fetchNotes } from './notes.js'

const execFileAsync = promisify(execFile)
const currentDir = dirname(fileURLToPath(import.meta.url))
const accessibilityHelperPath = join(
  currentDir,
  '..',
  'tools',
  'paste-listener.swift',
)

export type PermissionStatus = 'denied' | 'granted' | 'unavailable'

export type PermissionCheck = {
  detail: string
  status: PermissionStatus
}

export type PermissionReport = {
  accessibility: PermissionCheck
  notes: PermissionCheck
}

export const formatAccessibilityGuidance = (detail: string) =>
  [
    `Accessibility permission unavailable: ${detail}`,
    '',
    '中文说明：',
    '- 未开启辅助功能权限时，程序仍可轮询 Notes，但无法监听全局 Cmd+V / Ctrl+V。',
    '- 结果是当前剪贴板 payload 不会在粘贴后自动标记为 consumed，未消费内容可能持续累积。',
    '- 使用 `pnpm start` 时，本程序会直接退出，不继续运行 watch。',
    '- 开启路径：系统设置 > 隐私与安全性 > 辅助功能。',
    '- 请为实际运行命令的宿主应用授权，例如 Terminal、iTerm、Warp、VS Code 或 Cursor。',
    '',
    'English:',
    '- Without Accessibility permission, the app can still poll Notes, but it cannot listen for global Cmd+V / Ctrl+V.',
    '- The current clipboard payload will not be marked as consumed after paste, so unconsumed text may keep accumulating.',
    '- When using `pnpm start`, the process exits instead of continuing in watch mode.',
    '- Enable it in: System Settings > Privacy & Security > Accessibility.',
    '- Grant access to the actual host app running the command, such as Terminal, iTerm, Warp, VS Code, or Cursor.',
  ].join('\n')

export const formatNotesGuidance = (detail: string) =>
  [
    `Notes permission unavailable: ${detail}`,
    '',
    '中文说明：',
    '- 未开启 Notes 自动化权限时，程序无法读取 Notes.app 内容。',
    '- `init`、`once`、`watch` 都会失败，因为根本拿不到备忘录数据。',
    '- 开启方式：重新运行命令并在系统弹窗中允许，或前往 系统设置 > 隐私与安全性 > 自动化，允许当前终端宿主应用控制 Notes。',
    '',
    'English:',
    '- Without Notes automation permission, the app cannot read content from Notes.app.',
    '- `init`, `once`, and `watch` will fail because no note data can be fetched.',
    '- Re-run the command and allow the system prompt, or go to System Settings > Privacy & Security > Automation and allow the current host app to control Notes.',
  ].join('\n')

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const readStdout = (error: unknown) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'stdout' in error &&
    typeof Reflect.get(error, 'stdout') === 'string'
  ) {
    return Reflect.get(error, 'stdout') as string
  }

  return ''
}

const classifyNotesError = (message: string): PermissionCheck => {
  const normalized = message.toLowerCase()

  if (
    normalized.includes('not authorized') ||
    normalized.includes('not permitted') ||
    normalized.includes('authorization') ||
    normalized.includes('1743')
  ) {
    return {
      detail: message,
      status: 'denied',
    }
  }

  return {
    detail: message,
    status: 'unavailable',
  }
}

export const checkNotesPermission = async (
  accountName: string,
): Promise<PermissionCheck> => {
  try {
    const { notes } = await fetchNotes(accountName)
    return {
      detail: `account=${accountName} notes=${notes.length}`,
      status: 'granted',
    }
  } catch (error) {
    return classifyNotesError(toErrorMessage(error))
  }
}

export const checkAccessibilityPermission = async (
  prompt = false,
): Promise<PermissionCheck> => {
  try {
    const args = [accessibilityHelperPath, '--check']
    if (prompt) args.push('--prompt')
    const { stdout } = await execFileAsync('swift', args)

    const firstLine = stdout.trim().split('\n')[0] ?? ''
    if (firstLine === 'trusted=true') {
      return {
        detail: 'Accessibility granted',
        status: 'granted',
      }
    }
  } catch (error) {
    const firstLine = readStdout(error).trim().split('\n')[0] ?? ''
    if (firstLine === 'trusted=false') {
      return {
        detail: 'Accessibility denied',
        status: 'denied',
      }
    }

    const message = toErrorMessage(error)
    return {
      detail: message,
      status: 'unavailable',
    }
  }

  return {
    detail: 'Accessibility status unavailable',
    status: 'unavailable',
  }
}

export const checkPermissions = async (
  accountName: string,
): Promise<PermissionReport> => {
  const [notes, accessibility] = await Promise.all([
    checkNotesPermission(accountName),
    checkAccessibilityPermission(),
  ])

  return {
    accessibility,
    notes,
  }
}
