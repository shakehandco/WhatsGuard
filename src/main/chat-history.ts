import type { ChatMessage, IncomingMessage } from '@shared/types'

/** How many recent messages of context to keep per chat. */
export const HISTORY_SIZE = 5

/**
 * In-memory, transient rolling buffer of the last {@link HISTORY_SIZE} messages
 * per chat. Used purely to give the classifier conversational context so it can
 * judge a thread rather than an isolated line. Never persisted to disk.
 */
export class ChatHistory {
  private readonly buffers = new Map<string, ChatMessage[]>()

  /** Record a message (incoming or, optionally, context-only) into its chat buffer. */
  record(msg: IncomingMessage): void {
    const entry: ChatMessage = {
      id: msg.id,
      sender: msg.sender,
      senderName: msg.senderName,
      body: msg.body,
      fromMe: msg.fromMe,
      timestamp: msg.timestamp
    }
    const buf = this.buffers.get(msg.chatId) ?? []
    buf.push(entry)
    if (buf.length > HISTORY_SIZE) buf.splice(0, buf.length - HISTORY_SIZE)
    this.buffers.set(msg.chatId, buf)
  }

  /**
   * Return the recent context for a chat: the last {@link HISTORY_SIZE}
   * messages, oldest first. If `excludeMessageId` is given (the message
   * currently being analysed), it is omitted so the model sees only prior turns.
   */
  context(chatId: string): ChatMessage[] {
    return [...(this.buffers.get(chatId) ?? [])]
  }

  /** Drop a chat's buffer (e.g. on purge). */
  clear(chatId?: string): void {
    if (chatId) this.buffers.delete(chatId)
    else this.buffers.clear()
  }
}
