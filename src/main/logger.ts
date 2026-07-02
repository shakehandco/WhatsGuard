import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import type { FilterDropReason, Verdict } from '@shared/types'

/** Rotate a log once it passes this size (one backup kept as <name>.1). */
const MAX_BYTES = 5 * 1024 * 1024

type SystemLevel = 'INFO' | 'WARN' | 'ERROR'

/** A single decision record for the content/analysis audit trail. */
export interface ActivityEntry {
  chatId: string
  sender: string
  senderName: string
  type: string
  /** Message text (the audit log intentionally records content; local-only). */
  body: string
  isGroup: boolean
  /** What happened to this message. */
  decision: 'dropped' | 'analysed' | 'not_analysed'
  /** Set when decision === 'dropped'. */
  filterReason?: FilterDropReason
  /** Set when decision === 'analysed'. */
  verdict?: Verdict
  /** Set when decision === 'not_analysed' (e.g. model unavailable). */
  note?: string
}

class FileLog {
  constructor(private readonly file: string) {}

  write(line: string): void {
    try {
      if (existsSync(this.file) && statSync(this.file).size > MAX_BYTES) {
        renameSync(this.file, `${this.file}.1`) // overwrites any previous backup
      }
      appendFileSync(this.file, line + '\n')
    } catch {
      // Logging must never crash the app.
    }
  }
}

let systemLog: FileLog | undefined
let activityLog: FileLog | undefined
let dir = ''

export function logsDir(): string {
  return dir
}

/**
 * Delete the system + activity logs and their rotated backups (user erase).
 * Each FileLog only holds a path and writes via appendFileSync, so the files
 * re-create themselves on the next log line.
 */
export function clearLogs(): void {
  if (!dir) return
  for (const name of ['system.log', 'system.log.1', 'activity.log', 'activity.log.1']) {
    rmSync(join(dir, name), { force: true })
  }
}

export function initLogs(): void {
  dir = join(app.getPath('userData'), 'logs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  systemLog = new FileLog(join(dir, 'system.log'))
  activityLog = new FileLog(join(dir, 'activity.log'))
  logSystem('INFO', 'logger', `logs at ${dir}`)
}

/** Health / status / errors. Echoes to the console and the system log. No content. */
export function logSystem(level: SystemLevel, tag: string, message: string): void {
  const line = `${new Date().toISOString()} [${level}] [${tag}] ${message}`
  if (level === 'ERROR') console.error(line)
  else if (level === 'WARN') console.warn(line)
  else console.log(line)
  systemLog?.write(line)
}

/** Content + AI risk audit trail (JSONL). Echoes a concise summary to console. */
export function logActivity(entry: ActivityEntry): void {
  activityLog?.write(JSON.stringify({ ts: new Date().toISOString(), ...entry }))
  const summary =
    entry.decision === 'dropped'
      ? `dropped (${entry.filterReason})`
      : entry.decision === 'analysed'
        ? `${entry.verdict?.risk}/${entry.verdict?.category}`
        : `not analysed (${entry.note})`
  console.log(`[activity] ${entry.isGroup ? 'group ' : ''}${entry.senderName}: ${summary}`)
}
