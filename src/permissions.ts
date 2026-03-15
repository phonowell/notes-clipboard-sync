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

export const checkAccessibilityPermission =
  async (): Promise<PermissionCheck> => {
    try {
      const { stdout } = await execFileAsync('swift', [
        accessibilityHelperPath,
        '--check',
      ])

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
