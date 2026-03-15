import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { NoteSnapshot, StateFile, StoredNote } from './types.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isStoredNote = (value: unknown): value is StoredNote => {
  if (!isRecord(value)) return false

  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.text === 'string' &&
    typeof value.modifiedAt === 'string' &&
    typeof value.hash === 'string'
  )
}

const toStateFile = (value: unknown): StateFile | null => {
  if (!isRecord(value)) return null
  if (value.version !== 1) return null
  if (typeof value.updatedAt !== 'string') return null
  if (!isRecord(value.notes)) return null

  const notes: Record<string, StoredNote> = {}
  for (const [id, note] of Object.entries(value.notes)) {
    if (!isStoredNote(note)) return null
    notes[id] = note
  }

  return {
    notes,
    updatedAt: value.updatedAt,
    version: 1,
  }
}

export const hashText = (text: string) =>
  createHash('sha256').update(text).digest('hex')

export const toStoredNote = (note: NoteSnapshot): StoredNote => ({
  ...note,
  hash: hashText(note.text),
})

export const createState = (notes: NoteSnapshot[]): StateFile => {
  const mappedNotes: Record<string, StoredNote> = {}
  for (const note of notes) {
    mappedNotes[note.id] = toStoredNote(note)
  }

  return {
    notes: mappedNotes,
    updatedAt: new Date().toISOString(),
    version: 1,
  }
}

export const loadState = async (statePath: string): Promise<StateFile | null> => {
  try {
    const content = await readFile(statePath, 'utf8')
    return toStateFile(JSON.parse(content))
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return null

    throw error
  }
}

export const saveState = async (statePath: string, state: StateFile) => {
  await mkdir(dirname(statePath), { recursive: true })
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}
