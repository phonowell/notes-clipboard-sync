export type NoteSnapshot = {
  id: string
  modifiedAt: string
  text: string
  title: string
}

export type StoredNote = NoteSnapshot & {
  hash: string
}

export type StateFile = {
  notes: Record<string, StoredNote>
  updatedAt: string
  version: 1
}

export type Delta = {
  kind: 'append' | 'new'
  modifiedAt: string
  noteId: string
  text: string
  title: string
}

export type Conflict = {
  currentLength: number
  noteId: string
  previousLength: number
  title: string
}

export type SyncResult = {
  conflicts: Conflict[]
  deltas: Delta[]
  nextState: StateFile
}
