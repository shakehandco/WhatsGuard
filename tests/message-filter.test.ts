import { describe, it, expect } from 'vitest'
import { filterMessage, isSafeListed, normalizeNumber } from '../src/main/message-filter'
import type { IncomingMessage } from '../src/shared/types'

function msg(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    id: 'm1',
    chatId: '1234567890@c.us',
    sender: '1234567890@c.us',
    senderName: 'Unknown',
    body: 'This is a normal length message',
    type: 'chat',
    timestamp: 1_700_000_000,
    hasMedia: false,
    fromMe: false,
    ...overrides
  }
}

describe('filterMessage', () => {
  it('drops the elder\'s own outgoing messages', () => {
    expect(filterMessage(msg({ fromMe: true }), [])).toEqual({ pass: false, reason: 'from_me' })
  })

  it('drops messages from safe-listed senders (across number formats)', () => {
    // WhatsApp id carries the country code; safe-list entry is locally formatted.
    const res = filterMessage(msg({ sender: '11234567890@c.us' }), ['(123) 456-7890'])
    expect(res).toEqual({ pass: false, reason: 'safe_listed_sender' })
  })

  it('drops system notifications', () => {
    expect(filterMessage(msg({ type: 'e2e_notification' }), [])).toEqual({
      pass: false,
      reason: 'system_notification'
    })
    expect(filterMessage(msg({ type: 'gp2' }), [])).toEqual({
      pass: false,
      reason: 'system_notification'
    })
  })

  it('drops short text (< 6 chars)', () => {
    expect(filterMessage(msg({ body: 'ok' }), [])).toEqual({ pass: false, reason: 'too_short' })
    expect(filterMessage(msg({ body: '   hi  ' }), [])).toEqual({ pass: false, reason: 'too_short' })
  })

  it('passes a normal message', () => {
    expect(filterMessage(msg(), [])).toEqual({ pass: true })
  })

  it('passes a one-character image (media bypasses length check)', () => {
    expect(filterMessage(msg({ type: 'image', body: '!', hasMedia: true }), [])).toEqual({
      pass: true
    })
    expect(filterMessage(msg({ type: 'ptt', body: '', hasMedia: true }), [])).toEqual({
      pass: true
    })
  })
})

describe('safe-list matching', () => {
  it('normalizes numbers to digits only', () => {
    expect(normalizeNumber('+1 (234) 567-8900@c.us')).toBe('12345678900')
  })

  it('matches across formats by trailing digits', () => {
    expect(isSafeListed('1234567890@c.us', ['+1 (234) 567-7890'])).toBe(false)
    expect(isSafeListed('11234567890@c.us', ['1234567890'])).toBe(true)
    expect(isSafeListed('1234567890@c.us', ['1234567890'])).toBe(true)
  })

  it('does not match empty safe-list', () => {
    expect(isSafeListed('1234567890@c.us', [])).toBe(false)
  })
})
