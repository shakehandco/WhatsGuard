/**
 * Multi-account domain types shared across main, preload, and renderer.
 * Keep this free of any Node/Electron imports so the renderer can import it.
 */
import type { SessionState, VerdictRecord } from './types'

/** Opaque account identifier (UUID v4). */
export type AccountID = string

/** Per-account data persisted to the store. */
export interface AccountData {
  /** UUID — stable across sessions. */
  id: AccountID
  /** User-given friendly name, e.g. "Mom's phone". */
  label: string
  /** Linked phone number in +E.164 form, persisted so it survives restarts. */
  phoneNumber: string | null
  /** Trusted numbers for this account. */
  safeList: string[]
  /** Flagged-message verdicts (newest last). */
  verdicts: VerdictRecord[]
  /** ISO timestamp when the user consented to monitoring; null if not yet. */
  consentAt: string | null
}

/** Live summary the renderer uses in the account list. */
export interface AccountMeta {
  id: AccountID
  label: string
  /** Linked phone number in +E.164 form, or null until linked. */
  phoneNumber: string | null
  /** Current WhatsApp session state for this account. */
  sessionState: SessionState
}

/** Aggregate tray status across all accounts. */
export interface AggregateStatus {
  total: number
  ready: number
  /** True when at least one account is disconnected or has an auth failure. */
  needsAttention: boolean
}
