import type { IncomingMessage, FilterResult } from '@shared/types'

/** Minimum text length (characters) for a non-media message to be analysed. */
export const MIN_TEXT_LENGTH = 6

/**
 * Message types that carry analysable media. These bypass the length check —
 * a one-character caption on a scam image must still pass.
 */
const MEDIA_TYPES = new Set(['image', 'video', 'ptt', 'audio'])

/**
 * Message types that are system/protocol notifications, not real conversation.
 * Always dropped — group joins/leaves, the "messages are end-to-end encrypted"
 * banner, missed calls, security-code changes, protocol/reaction frames, etc.
 */
const SYSTEM_TYPES = new Set([
  'e2e_notification',
  'notification',
  'notification_template',
  'gp2', // group participant change
  'call_log',
  'ciphertext',
  'protocol',
  'revoked',
  'debug',
  'security',
  'broadcast_notification'
])

export function isMediaType(type: string): boolean {
  return MEDIA_TYPES.has(type)
}

export function isSystemType(type: string): boolean {
  return SYSTEM_TYPES.has(type)
}

/** Extract just the digits of a WhatsApp id/number for safe-list comparison. */
export function normalizeNumber(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * Decide whether a number is safe-listed. Matches on trailing digits so that
 * "+1 (234) 567-8900", "12345678900", and "12345678900@c.us" all compare equal.
 */
export function isSafeListed(sender: string, safeList: string[]): boolean {
  const s = normalizeNumber(sender)
  if (!s) return false
  return safeList.some((entry) => {
    const e = normalizeNumber(entry)
    if (!e) return false
    const shorter = e.length < s.length ? e : s
    const longer = e.length < s.length ? s : e
    return longer.endsWith(shorter)
  })
}

/**
 * Pure pre-filter. Runs before any LLM call. Drops:
 *   (a) the elder's own outgoing messages,
 *   (b) safe-listed senders (trusted family/contacts),
 *   (c) system/protocol notifications,
 *   (d) text messages shorter than MIN_TEXT_LENGTH (media bypasses this).
 * Only messages that survive all four are sent for analysis.
 */
export function filterMessage(msg: IncomingMessage, safeList: string[]): FilterResult {
  if (msg.fromMe) {
    return { pass: false, reason: 'from_me' }
  }
  if (isSafeListed(msg.sender, safeList)) {
    return { pass: false, reason: 'safe_listed_sender' }
  }
  if (isSystemType(msg.type)) {
    return { pass: false, reason: 'system_notification' }
  }
  if (!msg.hasMedia && !isMediaType(msg.type)) {
    if (msg.body.trim().length < MIN_TEXT_LENGTH) {
      return { pass: false, reason: 'too_short' }
    }
  }
  return { pass: true }
}
