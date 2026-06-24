/**
 * Shared domain types used across main, preload, and renderer.
 * Keep this free of any Node/Electron imports so the renderer can import it.
 */
import type { Lang } from './i18n'

/** A message surfaced by the WhatsApp bridge. Incoming only — see invariants. */
export interface IncomingMessage {
  /** WhatsApp message id (stable, used for de-dupe). */
  id: string
  /** Chat/conversation id this message belongs to. */
  chatId: string
  /** Sender's WhatsApp id (e.g. "1234567890@c.us"). */
  sender: string
  /** Human-readable contact/push name, if known. */
  senderName: string
  /** Plain text body. Empty for pure-media messages. */
  body: string
  /** Normalised message type: 'chat' | 'image' | 'ptt' | 'audio' | 'video' | 'document' | 'protocol' | ... */
  type: string
  /** Unix epoch seconds. */
  timestamp: number
  /** True if the message carries media (image / voice note / etc.). */
  hasMedia: boolean
  /** Always false for analysed messages — we never analyse the elder's own outgoing. */
  fromMe: boolean
  /** Decoded media, attached by the bridge for analysable types (e.g. images). */
  media?: MessageMediaPayload
}

export interface MessageMediaPayload {
  mimetype: string
  /** Base64-encoded media data (no data: prefix). */
  dataBase64: string
}

/** A lightweight message kept in the rolling per-chat history buffer. */
export interface ChatMessage {
  id: string
  sender: string
  senderName: string
  body: string
  fromMe: boolean
  timestamp: number
}

/** Why the pre-filter dropped a message (for logging / debugging only). */
export type FilterDropReason =
  | 'too_short'
  | 'system_notification'
  | 'safe_listed_sender'
  | 'from_me'

export interface FilterResult {
  pass: boolean
  reason?: FilterDropReason
}

export type RiskLevel = 'low' | 'medium' | 'high'

export type ScamCategory =
  | 'none'
  | 'urgency_money'
  | 'gift_card_crypto_wire'
  | 'impersonation'
  | 'grandparent'
  | 'romance'
  | 'fake_authority'
  | 'account_takeover'
  | 'malicious_link'
  | 'other'

/** Structured verdict the local LLM must return. */
export interface Verdict {
  risk: RiskLevel
  category: ScamCategory
  /** The specific phrase/element that triggered the verdict. */
  trigger: string
  /** Plain-language, elder-friendly explanation. */
  plain_reason: string
}

/** A verdict persisted to the local store. No full transcript is stored. */
export interface VerdictRecord {
  id: string
  messageId: string
  chatId: string
  /** Sender's WhatsApp id (e.g. "1234567890@s.whatsapp.net" or "…@lid"). */
  sender: string
  senderName: string
  /** Short excerpt of the flagged message (not the full conversation). */
  excerpt: string
  verdict: Verdict
  timestamp: number
  dismissed: boolean
}

/** WhatsApp linked-device session lifecycle. */
export type SessionStatus =
  | 'initializing'
  | 'qr'
  | 'authenticated'
  | 'ready'
  | 'disconnected'
  | 'auth_failure'

export interface SessionState {
  status: SessionStatus
  /** Data-URL of the QR code when status === 'qr'. */
  qr?: string
  /** Human-readable detail, e.g. disconnect reason. */
  detail?: string
}

export interface OnboardingState {
  consentGiven: boolean
  modelPresent: boolean
}

export interface DownloadProgress {
  received: number
  total: number
  /** 0..1, or -1 when total is unknown. */
  ratio: number
}

/** Status of the first-run model download. */
export interface ModelStatus {
  phase: 'idle' | 'downloading' | 'done' | 'error'
  detail?: string
}

export type ModelTier = 'e2b' | 'e4b' | '12b'

export interface HardwareInfo {
  totalRamGB: number
  freeDiskGB: number
  recommendedTier: ModelTier
}

/** Typed API surface exposed to the renderer via the preload bridge. */
export interface WhatsGuardApi {
  getSessionState(): Promise<SessionState>
  onSessionState(cb: (s: SessionState) => void): () => void
  onAlert(cb: (r: VerdictRecord) => void): () => void
  listAlerts(): Promise<VerdictRecord[]>
  dismissAlert(id: string, wasFalsePositive: boolean): Promise<void>
  purgeAll(): Promise<void>
  getSafeList(): Promise<string[]>
  addSafeNumber(num: string): Promise<void>
  removeSafeNumber(num: string): Promise<void>
  getHardwareInfo(): Promise<HardwareInfo>

  // First-run onboarding
  getOnboardingState(): Promise<OnboardingState>
  recordConsent(): Promise<void>
  startModelDownload(): Promise<void>
  onModelProgress(cb: (p: DownloadProgress) => void): () => void
  onModelStatus(cb: (s: ModelStatus) => void): () => void

  // Language
  getLanguage(): Promise<Lang>
  setLanguage(lang: Lang): Promise<void>
}
