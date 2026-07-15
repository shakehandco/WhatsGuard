/**
 * Shared domain types used across main, preload, and renderer.
 * Keep this free of any Node/Electron imports so the renderer can import it.
 */
import type { Lang } from './i18n'
import type { AccountID, AccountMeta, AggregateStatus } from './account-types'

// Re-export multi-account types for convenience (single import for renderer).
export type { AccountID, AccountData, AccountMeta, AggregateStatus } from './account-types'

/** A message surfaced by the WhatsApp bridge. Incoming only — see invariants. */
export interface IncomingMessage {
  /** WhatsApp message id (stable, used for de-dupe). */
  id: string
  /** Chat/conversation id this message belongs to. */
  chatId: string
  /** Sender's WhatsApp id (e.g. "1234567890@c.us", or an opaque "…@lid"). */
  sender: string
  /**
   * Sender's phone-number jid, resolved from the LID when `sender` is a "@lid".
   * Lets the safe-list match real numbers even though WhatsApp routes many 1:1
   * chats by an opaque LID. Undefined when sender is already a phone number or
   * the mapping isn't known yet.
   */
  senderPn?: string
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

/** Display metadata for a user-selectable model. Renderer-safe (no Node imports). */
export interface ModelTierInfo {
  tier: ModelTier
  /** Brand label shown in the UI, e.g. "Gemma 4 · 4B". Not translated. */
  label: string
  /** Approximate total download size in GB (model + projector), for UI hints. */
  downloadGB: number
  /** Recommended minimum system RAM in GB. */
  minRamGB: number
}

/**
 * The models a user may pick between (4B for most machines, 12B for powerful
 * ones). E2B remains in {@link ModelTier} as a low-RAM fallback but is not
 * user-selectable.
 */
export const SELECTABLE_MODELS: ModelTierInfo[] = [
  { tier: 'e4b', label: 'Gemma 4 · 4B', downloadGB: 6, minRamGB: 8 },
  { tier: '12b', label: 'Gemma 4 · 12B', downloadGB: 8, minRamGB: 16 }
]

export interface HardwareInfo {
  totalRamGB: number
  freeDiskGB: number
  recommendedTier: ModelTier
}

/** Health of the local llama-server, surfaced in the system-info card. */
export type ModelHealth = 'stopped' | 'starting' | 'ready' | 'cooldown'

/** Useful, mostly-static runtime facts shown in the System info card. */
export interface SystemInfo {
  /** App version from package.json. */
  appVersion: string
  /** Display name of the local LLM (the GGUF model file in use). */
  modelName: string
  /** Model tier actually running (e2b/e4b/12b). */
  modelTier: ModelTier
  /** Whether the model file is downloaded. */
  modelPresent: boolean
  /** Current llama-server state. */
  modelHealth: ModelHealth
  /** The linked WhatsApp number in +E.164 form, or null until linked. */
  whatsappNumber: string | null
  /** Date the bundled scam-rules config was last updated (OTA-updatable). */
  scamRulesUpdatedAt: string
  /** Absolute path to the logs folder. */
  logsDir: string
  /** Absolute path to the on-disk data/store folder. */
  dataDir: string
}

/** Typed API surface exposed to the renderer via the preload bridge. */
export interface WhatsGuardApi {
  // --- account management ---
  listAccounts(): Promise<AccountMeta[]>
  createAccount(label: string): Promise<AccountMeta>
  deleteAccount(id: AccountID): Promise<void>
  activateAccount(id: AccountID): Promise<void>
  renameAccount(id: AccountID, label: string): Promise<void>
  /** Aggregate status for the tray/menu-bar icon. */
  onAggregateStatus(cb: (s: AggregateStatus) => void): () => void

  // --- active-account scoped ---
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

  // System info / lifecycle
  getSystemInfo(): Promise<SystemInfo>
  openLogs(): Promise<void>
  quitApp(): Promise<void>
  /** Unlink the WhatsApp number and erase all local data (factory reset). */
  disconnect(): Promise<void>

  // First-run onboarding
  getOnboardingState(): Promise<OnboardingState>
  recordConsent(): Promise<void>
  /** Download (and select) a model tier; defaults to the current selection. */
  startModelDownload(tier?: ModelTier): Promise<void>
  onModelProgress(cb: (p: DownloadProgress) => void): () => void
  onModelStatus(cb: (s: ModelStatus) => void): () => void

  // Model selection
  getModelTier(): Promise<ModelTier>
  /** Switch the active model: downloads it if missing, then restarts inference. */
  setModelTier(tier: ModelTier): Promise<void>

  // Language
  getLanguage(): Promise<Lang>
  setLanguage(lang: Lang): Promise<void>
}
