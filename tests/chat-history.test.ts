import { describe, it, expect } from 'vitest'
import { ChatHistory, HISTORY_SIZE } from '../src/main/chat-history'
import type { IncomingMessage } from '../src/shared/types'

function msg(chatId: string, body: string, n: number): IncomingMessage {
  return {
    id: `m${n}`,
    chatId,
    sender: `${chatId}`,
    senderName: 'Tester',
    body,
    type: 'chat',
    timestamp: 1_700_000_000 + n,
    hasMedia: false,
    fromMe: false
  }
}

describe('ChatHistory', () => {
  it('keeps only the last HISTORY_SIZE messages, oldest first', () => {
    const h = new ChatHistory()
    for (let i = 0; i < HISTORY_SIZE + 3; i++) h.record(msg('chatA', `m${i}`, i))
    const ctx = h.context('chatA')
    expect(ctx).toHaveLength(HISTORY_SIZE)
    expect(ctx[0].body).toBe('m3') // oldest retained
    expect(ctx[ctx.length - 1].body).toBe(`m${HISTORY_SIZE + 2}`) // newest
  })

  it('isolates buffers per chat', () => {
    const h = new ChatHistory()
    h.record(msg('chatA', 'hello A', 1))
    h.record(msg('chatB', 'hello B', 2))
    expect(h.context('chatA')).toHaveLength(1)
    expect(h.context('chatB')[0].body).toBe('hello B')
  })

  it('clears a single chat or all', () => {
    const h = new ChatHistory()
    h.record(msg('chatA', 'a', 1))
    h.record(msg('chatB', 'b', 2))
    h.clear('chatA')
    expect(h.context('chatA')).toHaveLength(0)
    expect(h.context('chatB')).toHaveLength(1)
    h.clear()
    expect(h.context('chatB')).toHaveLength(0)
  })
})
