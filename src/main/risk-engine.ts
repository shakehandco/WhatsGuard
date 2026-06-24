import { randomUUID } from 'crypto'
import type { IncomingMessage, RiskLevel, ScamCategory, Verdict, VerdictRecord } from '@shared/types'
import type { ScamConfig } from './config'

const RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 }

export function meetsThreshold(risk: RiskLevel, threshold: RiskLevel): boolean {
  return RANK[risk] >= RANK[threshold]
}

/** After this many false-positive dismissals, a category only alerts at 'high'. */
const FALSE_POSITIVE_SUPPRESS_AT = 3
const EXCERPT_LEN = 140

/**
 * Decides whether a verdict should surface as an alert, and records it. Guards
 * against alarm fatigue: de-dupes per message, honours the config threshold, and
 * raises the bar for categories the user has repeatedly marked as false alarms.
 */
export class RiskEngine {
  private readonly seen = new Set<string>()
  /** category -> count of false-positive dismissals (in-memory tuning). */
  private readonly falsePositives = new Map<ScamCategory, number>()

  constructor(private readonly config: ScamConfig) {}

  /** Effective threshold for a category, raised if it's been dismissed a lot. */
  private effectiveThreshold(category: ScamCategory): RiskLevel {
    const base = this.config.thresholds.notifyAtOrAbove
    const fp = this.falsePositives.get(category) ?? 0
    if (fp >= FALSE_POSITIVE_SUPPRESS_AT) return 'high'
    return base
  }

  /**
   * Process a verdict. Returns a VerdictRecord to surface + persist, or null if
   * the message is below threshold or already seen.
   */
  process(msg: IncomingMessage, verdict: Verdict): VerdictRecord | null {
    if (this.seen.has(msg.id)) return null
    this.seen.add(msg.id)

    if (verdict.category === 'none') return null
    if (!meetsThreshold(verdict.risk, this.effectiveThreshold(verdict.category))) return null

    return {
      id: randomUUID(),
      messageId: msg.id,
      chatId: msg.chatId,
      sender: msg.sender,
      senderName: msg.senderName,
      excerpt: msg.body.slice(0, EXCERPT_LEN),
      verdict,
      timestamp: msg.timestamp,
      dismissed: false
    }
  }

  /** Feed back a user dismissal so repeat false alarms in a category get quieter. */
  recordDismissal(category: ScamCategory, wasFalsePositive: boolean): void {
    if (!wasFalsePositive) return
    this.falsePositives.set(category, (this.falsePositives.get(category) ?? 0) + 1)
  }
}
