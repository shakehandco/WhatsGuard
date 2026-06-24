import { describe, it, expect } from 'vitest'
import { RiskEngine, meetsThreshold } from '../src/main/risk-engine'
import type { ScamConfig } from '../src/main/config'
import type { IncomingMessage, Verdict } from '../src/shared/types'

const config: ScamConfig = {
  version: 1,
  updatedAt: '2026-06-09',
  systemPrompt: '',
  categories: [],
  instructions: '',
  thresholds: { notifyAtOrAbove: 'medium' }
}

function msg(id: string): IncomingMessage {
  return {
    id,
    chatId: 'c1',
    sender: 's1',
    senderName: 'Stranger',
    body: 'Send me a gift card now',
    type: 'chat',
    timestamp: 1,
    hasMedia: false,
    fromMe: false
  }
}

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  risk: 'high',
  category: 'gift_card_crypto_wire',
  trigger: 'gift card',
  plain_reason: 'Asking for gift cards is a scam.',
  ...over
})

describe('meetsThreshold', () => {
  it('ranks risk levels', () => {
    expect(meetsThreshold('high', 'medium')).toBe(true)
    expect(meetsThreshold('low', 'medium')).toBe(false)
    expect(meetsThreshold('medium', 'medium')).toBe(true)
  })
})

describe('RiskEngine', () => {
  it('surfaces a high-risk verdict above threshold', () => {
    const e = new RiskEngine(config)
    const rec = e.process(msg('a'), verdict())
    expect(rec).not.toBeNull()
    expect(rec?.verdict.risk).toBe('high')
    expect(rec?.excerpt).toContain('gift card')
  })

  it('suppresses low risk and category none', () => {
    const e = new RiskEngine(config)
    expect(e.process(msg('a'), verdict({ risk: 'low' }))).toBeNull()
    expect(e.process(msg('b'), verdict({ category: 'none' }))).toBeNull()
  })

  it('de-dupes the same message id', () => {
    const e = new RiskEngine(config)
    expect(e.process(msg('dup'), verdict())).not.toBeNull()
    expect(e.process(msg('dup'), verdict())).toBeNull()
  })

  it('raises the bar after repeated false-positive dismissals (alarm fatigue)', () => {
    const e = new RiskEngine(config)
    for (let i = 0; i < 3; i++) e.recordDismissal('impersonation', true)
    // medium would normally alert, but this category is now suppressed to high
    expect(e.process(msg('x'), verdict({ risk: 'medium', category: 'impersonation' }))).toBeNull()
    expect(e.process(msg('y'), verdict({ risk: 'high', category: 'impersonation' }))).not.toBeNull()
  })
})
