import { homedir } from 'node:os'
import { join } from 'node:path'

export type CliConfig = {
  account: string
  command: 'init' | 'once' | 'permissions' | 'watch'
  debounceSeconds: number
  intervalSeconds: number
  statePath: string
}

const DEFAULT_ACCOUNT = 'iCloud'
const DEFAULT_DEBOUNCE_SECONDS = 1
const DEFAULT_INTERVAL_SECONDS = 1

export const defaultStatePath = () =>
  join(
    homedir(),
    'Library',
    'Application Support',
    'notes-clipboard-sync',
    'state.json',
  )

const readValue = (args: string[], flag: string) => {
  const index = args.indexOf(flag)
  if (index === -1) return ''
  const value = args[index + 1]
  return value ?? ''
}

export const parseCliConfig = (argv: string[]): CliConfig => {
  const [rawCommand] = argv
  const command =
    rawCommand === 'init' ||
    rawCommand === 'permissions' ||
    rawCommand === 'watch'
      ? rawCommand
      : 'once'
  const account = readValue(argv, '--account') || DEFAULT_ACCOUNT
  const statePath = readValue(argv, '--state') || defaultStatePath()
  const intervalValue = readValue(argv, '--interval')
  const debounceValue = readValue(argv, '--debounce')
  const parsedInterval = Number(intervalValue || DEFAULT_INTERVAL_SECONDS)
  const parsedDebounce = Number(debounceValue || DEFAULT_DEBOUNCE_SECONDS)
  const intervalSeconds =
    Number.isFinite(parsedInterval) && parsedInterval > 0
      ? parsedInterval
      : DEFAULT_INTERVAL_SECONDS
  const debounceSeconds =
    Number.isFinite(parsedDebounce) && parsedDebounce > 0
      ? parsedDebounce
      : DEFAULT_DEBOUNCE_SECONDS

  return {
    account,
    command,
    debounceSeconds,
    intervalSeconds,
    statePath,
  }
}
