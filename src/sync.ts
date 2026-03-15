import type { Conflict, Delta, NoteSnapshot, SyncResult } from './types.js'
import { createState } from './state.js'

const createDelta = (
  note: NoteSnapshot,
  kind: Delta['kind'],
  text: string,
): Delta => ({
  kind,
  modifiedAt: note.modifiedAt,
  noteId: note.id,
  text,
  title: note.title,
})

const createConflict = (
  note: NoteSnapshot,
  previousText: string,
): Conflict => ({
  currentLength: note.text.length,
  noteId: note.id,
  previousLength: previousText.length,
  title: note.title,
})

export const diffNotes = (
  previousNotes: Record<string, { text: string }>,
  currentNotes: NoteSnapshot[],
): SyncResult => {
  const deltas: Delta[] = []
  const conflicts: Conflict[] = []

  for (const note of currentNotes) {
    const previous = previousNotes[note.id]
    if (!previous) {
      if (note.text.length > 0) deltas.push(createDelta(note, 'new', note.text))
      continue
    }

    if (note.text === previous.text) continue

    if (note.text.startsWith(previous.text)) {
      const appended = note.text.slice(previous.text.length)
      if (appended.length > 0) {
        deltas.push(createDelta(note, 'append', appended))
      }
      continue
    }

    conflicts.push(createConflict(note, previous.text))
  }

  return {
    conflicts,
    deltas,
    nextState: createState(currentNotes),
  }
}

export const formatClipboardText = (deltas: Delta[]) =>
  deltas
    .map((delta) => delta.text)
    .join('\n\n')
