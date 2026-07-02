import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ModelTier, VerdictRecord } from '@shared/types'
import type { Lang } from '@shared/i18n'

/**
 * Plain, unencrypted local store (encryption is explicitly out of scope).
 * Persists ONLY verdicts/flags and the user's safe-list — never full
 * conversation transcripts. Each verdict keeps a short excerpt, not the thread.
 */
interface StoreData {
  /** Trusted numbers; messages from these are never analysed. */
  safeList: string[]
  /** Flagged-message verdicts (newest last). */
  verdicts: VerdictRecord[]
  /** ISO timestamp when the user consented to monitoring; null if not yet. */
  consentAt: string | null
  /** Chosen UI/LLM language; null means "not set, use OS locale". */
  language: Lang | null
  /** Chosen model tier; null means "not set, use the hardware recommendation". */
  modelTier: ModelTier | null
}

const DEFAULT_DATA: StoreData = {
  safeList: [],
  verdicts: [],
  consentAt: null,
  language: null,
  modelTier: null
}
/** Cap stored verdicts so the file can't grow unbounded. */
const MAX_VERDICTS = 1000

export class Store {
  private readonly file: string
  private data: StoreData

  private readonly dir: string

  constructor(dir = join(app.getPath('userData'), 'data')) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.dir = dir
    this.file = join(dir, 'whatsguard.json')
    this.data = this.load()
  }

  /** Absolute path of the folder holding the on-disk store. */
  dataDir(): string {
    return this.dir
  }

  private load(): StoreData {
    try {
      if (existsSync(this.file)) {
        const parsed = JSON.parse(readFileSync(this.file, 'utf-8'))
        return { ...DEFAULT_DATA, ...parsed }
      }
    } catch {
      // Corrupt file: start clean rather than crash. (Only verdicts are lost.)
    }
    return { ...DEFAULT_DATA }
  }

  private persist(): void {
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  // --- language ---

  getLanguage(): Lang | null {
    return this.data.language
  }

  setLanguage(lang: Lang): void {
    this.data.language = lang
    this.persist()
  }

  // --- model tier ---

  getModelTier(): ModelTier | null {
    return this.data.modelTier
  }

  setModelTier(tier: ModelTier): void {
    this.data.modelTier = tier
    this.persist()
  }

  // --- consent ---

  hasConsent(): boolean {
    return this.data.consentAt !== null
  }

  recordConsent(): void {
    if (!this.data.consentAt) {
      this.data.consentAt = new Date().toISOString()
      this.persist()
    }
  }

  // --- safe-list ---

  getSafeList(): string[] {
    return [...this.data.safeList]
  }

  addSafeNumber(num: string): void {
    const trimmed = num.trim()
    if (trimmed && !this.data.safeList.includes(trimmed)) {
      this.data.safeList.push(trimmed)
      this.persist()
    }
  }

  removeSafeNumber(num: string): void {
    const before = this.data.safeList.length
    this.data.safeList = this.data.safeList.filter((n) => n !== num)
    if (this.data.safeList.length !== before) this.persist()
  }

  // --- verdicts ---

  addVerdict(record: VerdictRecord): void {
    this.data.verdicts.push(record)
    if (this.data.verdicts.length > MAX_VERDICTS) {
      this.data.verdicts.splice(0, this.data.verdicts.length - MAX_VERDICTS)
    }
    this.persist()
  }

  listVerdicts(): VerdictRecord[] {
    return [...this.data.verdicts].sort((a, b) => b.timestamp - a.timestamp)
  }

  dismissVerdict(id: string): void {
    const rec = this.data.verdicts.find((v) => v.id === id)
    if (rec && !rec.dismissed) {
      rec.dismissed = true
      this.persist()
    }
  }

  /** Wipe all stored verdicts (user purge). Safe-list is preserved. */
  purgeVerdicts(): void {
    this.data.verdicts = []
    this.persist()
  }

  /**
   * Full factory reset: wipe verdicts, safe-list, consent, and language. Resets
   * the live instance (not an external file delete) so a later write can't
   * re-persist stale in-memory data. After this, the app reverts to first-run.
   */
  reset(): void {
    this.data = { ...DEFAULT_DATA }
    this.persist()
  }
}
