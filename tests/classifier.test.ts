import { describe, it, expect } from 'vitest'
import { parseVerdict, buildUserTurn, buildSystemPrompt, buildVerdictSchema } from '../src/main/classifier'
import type { ScamConfig } from '../src/main/config'
import type { ChatMessage, IncomingMessage } from '../src/shared/types'

const config: ScamConfig = {
  version: 1,
  updatedAt: '2026-06-09',
  systemPrompt: 'You are WhatsGuard.',
  categories: [
    { id: 'urgency_money', desc: 'money pressure' },
    { id: 'impersonation', desc: 'pretending to be family' }
  ],
  instructions: 'Return JSON.',
  thresholds: { notifyAtOrAbove: 'medium' }
}

function msg(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    id: 'm1',
    chatId: 'c1',
    sender: 's1',
    senderName: 'Stranger',
    body: 'Hi grandma, I lost my phone, send money',
    type: 'chat',
    timestamp: 1,
    hasMedia: false,
    fromMe: false,
    ...overrides
  }
}

describe('parseVerdict', () => {
  it('parses a clean JSON object', () => {
    const v = parseVerdict('{"risk":"high","category":"grandparent","trigger":"send money","plain_reason":"Scam."}')
    expect(v).toEqual({
      risk: 'high',
      category: 'grandparent',
      trigger: 'send money',
      plain_reason: 'Scam.'
    })
  })

  it('tolerates markdown fences and surrounding prose', () => {
    const raw = 'Here is my verdict:\n```json\n{"risk":"medium","category":"romance","trigger":"","plain_reason":"Be careful."}\n```'
    const v = parseVerdict(raw)
    expect(v.risk).toBe('medium')
    expect(v.category).toBe('romance')
  })

  it('falls back safely on invalid risk', () => {
    const v = parseVerdict('{"risk":"catastrophic","category":"urgency_money","trigger":"x","plain_reason":"y"}')
    expect(v.risk).toBe('low')
  })

  it('falls back safely on non-JSON', () => {
    expect(parseVerdict('the model rambled with no json')).toEqual({
      risk: 'low',
      category: 'none',
      trigger: '',
      plain_reason: ''
    })
  })
})

describe('prompt building', () => {
  it('includes categories in the system prompt', () => {
    const p = buildSystemPrompt(config)
    expect(p).toContain('urgency_money')
    expect(p).toContain('impersonation')
    expect(p).toContain('Return JSON.')
  })

  it('includes recent context and the target message', () => {
    const context: ChatMessage[] = [
      { id: 'h1', sender: 's1', senderName: 'Stranger', body: 'hello there', fromMe: false, timestamp: 0 }
    ]
    const turn = buildUserTurn(msg(), context)
    expect(typeof turn.content).toBe('string')
    expect(turn.content as string).toContain('Stranger: hello there')
    expect(turn.content as string).toContain('Message to analyse')
  })

  it('builds a verdict schema whose category enum matches the config + none/other', () => {
    const schema = buildVerdictSchema(config) as {
      properties: { risk: { enum: string[] }; category: { enum: string[] } }
      required: string[]
    }
    expect(schema.properties.risk.enum).toEqual(['low', 'medium', 'high'])
    expect(schema.properties.category.enum).toEqual([
      'none',
      'urgency_money',
      'impersonation',
      'other'
    ])
    expect(schema.required).toEqual(['risk', 'category', 'trigger', 'plain_reason'])
  })

  it('attaches an image part when media is present', () => {
    const turn = buildUserTurn(
      msg({ hasMedia: true, media: { mimetype: 'image/jpeg', dataBase64: 'AAAA' } }),
      []
    )
    expect(Array.isArray(turn.content)).toBe(true)
    const parts = turn.content as Array<{ type: string }>
    expect(parts.some((p) => p.type === 'image_url')).toBe(true)
  })
})
