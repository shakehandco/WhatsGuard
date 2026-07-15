import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { join } from 'path'
import type { ModelTier, VerdictRecord } from '@shared/types'
import type { Lang } from '@shared/i18n'
import type { AccountID, AccountData } from '@shared/account-types'

/**
 * Plain, unencrypted local store (encryption is explicitly out of scope).
 * Persists ONLY verdicts/flags and the user's safe-list — never full
 * conversation transcripts. Each verdict keeps a short excerpt, not the thread.
 *
 * Multi-account: safe-list, verdicts, and consent are per-account. Language and
 * model tier are global (shared across accounts).
 */
interface StoreData {
  /** All accounts keyed by their UUID. */
  accounts: Record<AccountID, AccountData>
  /** Stable ordering for the account list. */
  accountOrder: AccountID[]
  /** Chosen UI/LLM language; null means "not set, use OS locale". */
  language: Lang | null
  /** Chosen model tier; null means "not set, use the hardware recommendation". */
  modelTier: ModelTier | null
}

const DEFAULT_DATA: StoreData = {
  accounts: {},
  accountOrder: [],
  language: null,
  modelTier: null
}
/** Cap stored verdicts per account so the file can't grow unbounded. */
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
        const merged = { ...DEFAULT_DATA, ...parsed }
        // Migrate legacy single-account data: if there is no accounts map
        // but the old top-level keys exist, wrap them into one account.
        if (
          Object.keys(merged.accounts).length === 0 &&
          (parsed.safeList || parsed.verdicts || parsed.consentAt)
        ) {
          const legacyId = randomUUID()
          merged.accounts[legacyId] = {
            id: legacyId,
            label: 'My WhatsApp',
            phoneNumber: null,
            safeList: Array.isArray(parsed.safeList) ? parsed.safeList : [],
            verdicts: Array.isArray(parsed.verdicts) ? parsed.verdicts : [],
            consentAt: typeof parsed.consentAt === 'string' ? parsed.consentAt : null
          }
          merged.accountOrder = [legacyId]
        }
        return merged
      }
    } catch {
      // Corrupt file: start clean rather than crash. (Only verdicts are lost.)
    }
    return { ...DEFAULT_DATA }
  }

  private persist(): void {
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  // --- language (global) ---

  getLanguage(): Lang | null {
    return this.data.language
  }

  setLanguage(lang: Lang): void {
    this.data.language = lang
    this.persist()
  }

  // --- model tier (global) ---

  getModelTier(): ModelTier | null {
    return this.data.modelTier
  }

  setModelTier(tier: ModelTier): void {
    this.data.modelTier = tier
    this.persist()
  }

  // --- account CRUD ---

  listAccounts(): AccountData[] {
    return this.data.accountOrder
      .map((id) => this.data.accounts[id])
      .filter(Boolean)
  }

  getAccount(id: AccountID): AccountData | undefined {
    return this.data.accounts[id]
  }

  createAccount(label: string): AccountData {
    const id = randomUUID()
    const acc: AccountData = {
      id,
      label: label.trim() || 'WhatsApp',
      phoneNumber: null,
      safeList: [],
      verdicts: [],
      consentAt: null
    }
    this.data.accounts[id] = acc
    this.data.accountOrder.push(id)
    this.persist()
    return acc
  }

  deleteAccount(id: AccountID): void {
    delete this.data.accounts[id]
    this.data.accountOrder = this.data.accountOrder.filter((oid) => oid !== id)
    this.persist()
  }

  renameAccount(id: AccountID, label: string): void {
    const acc = this.data.accounts[id]
    if (acc) {
      acc.label = label.trim() || acc.label
      this.persist()
    }
  }

  setPhoneNumber(id: AccountID, phone: string): void {
    const acc = this.data.accounts[id]
    if (acc && acc.phoneNumber !== phone) {
      acc.phoneNumber = phone
      this.persist()
    }
  }

  // --- consent (per-account) ---

  hasConsent(accountId: AccountID): boolean {
    return this.data.accounts[accountId]?.consentAt !== null
  }

  recordConsent(accountId: AccountID): void {
    const acc = this.data.accounts[accountId]
    if (acc && !acc.consentAt) {
      acc.consentAt = new Date().toISOString()
      this.persist()
    }
  }

  // --- safe-list (per-account) ---

  getSafeList(accountId: AccountID): string[] {
    return [...(this.data.accounts[accountId]?.safeList ?? [])]
  }

  addSafeNumber(accountId: AccountID, num: string): void {
    const acc = this.data.accounts[accountId]
    if (!acc) return
    const trimmed = num.trim()
    if (trimmed && !acc.safeList.includes(trimmed)) {
      acc.safeList.push(trimmed)
      this.persist()
    }
  }

  removeSafeNumber(accountId: AccountID, num: string): void {
    const acc = this.data.accounts[accountId]
    if (!acc) return
    const before = acc.safeList.length
    acc.safeList = acc.safeList.filter((n) => n !== num)
    if (acc.safeList.length !== before) this.persist()
  }

  // --- verdicts (per-account) ---

  addVerdict(accountId: AccountID, record: VerdictRecord): void {
    const acc = this.data.accounts[accountId]
    if (!acc) return
    acc.verdicts.push(record)
    if (acc.verdicts.length > MAX_VERDICTS) {
      acc.verdicts.splice(0, acc.verdicts.length - MAX_VERDICTS)
    }
    this.persist()
  }

  listVerdicts(accountId: AccountID): VerdictRecord[] {
    const verdicts = this.data.accounts[accountId]?.verdicts ?? []
    return [...verdicts].sort((a, b) => b.timestamp - a.timestamp)
  }

  dismissVerdict(accountId: AccountID, id: string): void {
    const rec = this.data.accounts[accountId]?.verdicts.find((v) => v.id === id)
    if (rec && !rec.dismissed) {
      rec.dismissed = true
      this.persist()
    }
  }

  /** Wipe all stored verdicts for an account (user purge). Safe-list is preserved. */
  purgeVerdicts(accountId: AccountID): void {
    const acc = this.data.accounts[accountId]
    if (acc) {
      acc.verdicts = []
      this.persist()
    }
  }

  /**
   * Full factory reset for one account: wipe verdicts, safe-list, and consent.
   * After this, the account needs to re-consent.
   */
  resetAccount(accountId: AccountID): void {
    const acc = this.data.accounts[accountId]
    if (!acc) return
    acc.safeList = []
    acc.verdicts = []
    acc.consentAt = null
    this.persist()
  }
}
