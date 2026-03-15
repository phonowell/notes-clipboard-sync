import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { NoteSnapshot } from './types.js'

const execFileAsync = promisify(execFile)

const JXA_SCRIPT = `
ObjC.import('Foundation');
const app = Application('Notes');
app.includeStandardAdditions = true;
const env = $.NSProcessInfo.processInfo.environment;
const rawAccount = env.objectForKey('NOTES_ACCOUNT');
const targetAccount = rawAccount ? ObjC.unwrap(rawAccount) : 'iCloud';
const account = app.accounts.byName(targetAccount);

if (!account.exists()) {
  throw new Error('Account not found: ' + targetAccount);
}

const notes = account.notes().map((note) => ({
  id: String(note.id()),
  title: String(note.name()),
  text: String(note.plaintext()),
  modifiedAt: new Date(note.modificationDate()).toISOString(),
}));

JSON.stringify({
  account: String(account.name()),
  notes,
});
`

type RawNotesPayload = {
  account: string
  notes: unknown[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const toStringValue = (value: unknown) =>
  typeof value === 'string' ? value : ''

const toNoteSnapshot = (value: unknown): NoteSnapshot | null => {
  if (!isRecord(value)) return null

  const id = toStringValue(value.id)
  const title = toStringValue(value.title)
  const text = toStringValue(value.text)
  const modifiedAt = toStringValue(value.modifiedAt)

  if (!id || !modifiedAt) return null

  return {
    id,
    modifiedAt,
    text,
    title,
  }
}

const toPayload = (value: unknown): RawNotesPayload | null => {
  if (!isRecord(value)) return null
  if (!Array.isArray(value.notes)) return null

  const account = toStringValue(value.account)
  if (!account) return null

  return {
    account,
    notes: value.notes,
  }
}

export const fetchNotes = async (accountName: string) => {
  const { stdout } = await execFileAsync(
    'osascript',
    ['-l', 'JavaScript', '-e', JXA_SCRIPT],
    {
      env: {
        ...process.env,
        NOTES_ACCOUNT: accountName,
      },
      maxBuffer: 10 * 1024 * 1024,
    },
  )

  const parsed: unknown = JSON.parse(stdout)
  const payload = toPayload(parsed)
  if (!payload) throw new Error('Invalid Notes payload')

  const notes = payload.notes
    .map(toNoteSnapshot)
    .filter((note): note is NoteSnapshot => note !== null)
    .sort((a, b) => a.modifiedAt.localeCompare(b.modifiedAt))

  return {
    account: payload.account,
    notes,
  }
}
