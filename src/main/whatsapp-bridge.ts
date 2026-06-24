import { app } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import QRCode from 'qrcode'
import type { WASocket, WAMessage, proto, ConnectionState, AuthenticationState } from 'baileys'
import type { IncomingMessage, SessionState, SessionStatus } from '@shared/types'
import { logSystem } from './logger'

/** Bound reconnect attempts so a persistent failure can't loop forever. */
const MAX_RECONNECT_ATTEMPTS = 5
/** Shown in WhatsApp → Linked Devices. */
const BROWSER: [string, string, string] = ['WhatsGuard', 'Chrome', '1.0.0']

/**
 * Baileys is ESM-only; our main bundle is CommonJS. A normal import would be
 * rewritten to require() (which fails on ESM), so we load it via a runtime
 * dynamic import that the bundler can't see (`new Function`), resolving the
 * package path with require.resolve so it works packaged and in dev.
 */
async function loadBaileys(): Promise<typeof import('baileys')> {
  const entry = require.resolve('baileys')
  const dynamicImport = new Function('u', 'return import(u)') as (u: string) => Promise<unknown>
  return (await dynamicImport(pathToFileURL(entry).href)) as typeof import('baileys')
}

/** Minimal no-op logger satisfying Baileys' ILogger (keeps protocol noise out). */
const silentLogger = {
  level: 'silent',
  child() {
    return silentLogger
  },
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {}
} as unknown as NonNullable<Parameters<typeof import('baileys').default>[0]['logger']>

export interface BridgeOptions {
  /** Folder where Baileys multi-file auth state is persisted. */
  sessionDataPath: string
  onSessionState: (state: SessionState) => void
  /** Called for each *incoming* message (never the elder's own). */
  onMessage: (msg: IncomingMessage) => void
}

/**
 * WhatsApp link via Baileys' WebSocket multi-device protocol — no Chromium, no
 * Puppeteer, no DOM injection. Messages and media arrive as native events.
 *
 * INVARIANT — strictly passive. This class exposes no method that sends,
 * replies, reacts, or marks-as-read. `markOnlineOnConnect: false` also avoids
 * broadcasting presence. The product's safety from account bans depends on never
 * originating any WhatsApp action.
 */
export class WhatsAppBridge {
  private readonly opts: BridgeOptions
  private baileys?: typeof import('baileys')
  private sock?: WASocket
  private saveCreds?: () => Promise<void>
  private state: SessionState = { status: 'initializing' }
  private reconnectAttempts = 0
  private closing = false

  constructor(opts: BridgeOptions) {
    this.opts = opts
  }

  getState(): SessionState {
    return this.state
  }

  private setState(status: SessionStatus, extra: Partial<SessionState> = {}): void {
    this.state = { status, ...extra }
    this.opts.onSessionState(this.state)
  }

  async start(): Promise<void> {
    this.setState('initializing')
    this.baileys = await loadBaileys()
    const { useMultiFileAuthState } = this.baileys
    const { state, saveCreds } = await useMultiFileAuthState(this.opts.sessionDataPath)
    this.saveCreds = saveCreds
    this.spawnSocket(state)
  }

  private spawnSocket(authState: AuthenticationState): void {
    const makeWASocket = this.baileys!.default
    const sock = makeWASocket({
      auth: authState,
      logger: silentLogger,
      browser: BROWSER,
      markOnlineOnConnect: false, // stay passive — don't broadcast presence
      syncFullHistory: false
    })
    this.sock = sock

    if (this.saveCreds) sock.ev.on('creds.update', this.saveCreds)
    sock.ev.on('connection.update', (u) => this.onConnectionUpdate(u, authState))
    sock.ev.on('messages.upsert', (u) => void this.onMessagesUpsert(u))
  }

  private async onConnectionUpdate(
    update: Partial<ConnectionState>,
    authState: AuthenticationState
  ): Promise<void> {
    const { connection, lastDisconnect, qr } = update
    const { DisconnectReason } = this.baileys!

    if (qr) {
      try {
        const dataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 320 })
        this.setState('qr', { qr: dataUrl })
      } catch {
        this.setState('qr')
      }
    }

    if (connection === 'connecting') {
      this.setState(this.state.status === 'qr' ? 'qr' : 'initializing')
    }

    if (connection === 'open') {
      this.reconnectAttempts = 0
      this.setState('ready')
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
        ?.output?.statusCode
      const loggedOut = statusCode === DisconnectReason.loggedOut

      if (this.closing) return
      if (loggedOut) {
        // The phone unlinked us — credentials are dead; a re-scan is required.
        this.setState('auth_failure', { detail: 'WhatsApp was unlinked. Please re-scan the code.' })
        return
      }
      if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        this.setState('disconnected', {
          detail: 'Could not reconnect. Please open WhatsGuard and check your connection.'
        })
        return
      }
      this.reconnectAttempts += 1
      this.setState('disconnected', { detail: `Reconnecting (attempt ${this.reconnectAttempts})…` })
      setTimeout(() => {
        if (!this.closing) this.spawnSocket(authState)
      }, 2000 * this.reconnectAttempts)
    }
  }

  private async onMessagesUpsert(upsert: {
    messages: WAMessage[]
    type: 'append' | 'notify'
  }): Promise<void> {
    logSystem('INFO', 'wa', `upsert type=${upsert.type} count=${upsert.messages.length}`)
    if (upsert.type !== 'notify') return // only brand-new incoming messages
    for (const msg of upsert.messages) {
      await this.handleMessage(msg)
    }
  }

  private async handleMessage(msg: WAMessage): Promise<void> {
    const remoteJid = msg.key.remoteJid ?? ''
    const rawKeys = msg.message ? Object.keys(msg.message) : []
    logSystem(
      'INFO',
      'wa',
      `msg jid=${remoteJid} fromMe=${msg.key.fromMe} participant=${msg.key.participant ?? '-'} keys=[${rawKeys.join(',')}]`
    )

    // Ignore our own outgoing and status broadcasts.
    if (msg.key.fromMe) return
    if (remoteJid === 'status@broadcast') return

    // Unwrap ephemeral / view-once / edited envelopes (common in groups with
    // disappearing messages) to reach the real content before typing it.
    const { getContentType, normalizeMessageContent } = this.baileys!
    const content = normalizeMessageContent(msg.message)
    if (!content) {
      logSystem('INFO', 'wa', `skip: undecryptable / no content (jid=${remoteJid})`)
      return
    }

    const contentType = getContentType(content)
    const incoming = this.toIncoming(msg, remoteJid, contentType, content)

    // Decode images so the multimodal model can read scam screenshots/photos.
    if (contentType === 'imageMessage') {
      await this.attachImage(msg, incoming)
    }
    this.opts.onMessage(incoming)
  }

  private toIncoming(
    msg: WAMessage,
    remoteJid: string,
    contentType: keyof proto.IMessage | undefined,
    content: proto.IMessage
  ): IncomingMessage {
    const body =
      content.conversation ??
      content.extendedTextMessage?.text ??
      content.imageMessage?.caption ??
      content.videoMessage?.caption ??
      ''
    const sender = msg.key.participant || remoteJid // participant set for groups
    return {
      id: msg.key.id ?? `${remoteJid}-${msg.messageTimestamp}`,
      chatId: remoteJid,
      sender,
      senderName: msg.pushName || sender,
      body,
      type: mapType(contentType, content),
      timestamp: Number(msg.messageTimestamp ?? 0),
      hasMedia: isMediaContent(contentType),
      fromMe: false
    }
  }

  private async attachImage(msg: WAMessage, incoming: IncomingMessage): Promise<void> {
    try {
      const buffer = (await this.baileys!.downloadMediaMessage(msg, 'buffer', {}, {
        logger: silentLogger,
        reuploadRequest: this.sock!.updateMediaMessage
      })) as Buffer
      const mimetype = msg.message?.imageMessage?.mimetype || 'image/jpeg'
      if (mimetype.startsWith('image/')) {
        incoming.media = { mimetype, dataBase64: buffer.toString('base64') }
      }
    } catch {
      // Media download can fail transiently; analyse text/metadata instead.
    }
  }

  async destroy(): Promise<void> {
    this.closing = true
    try {
      // logout() would unlink the device; we only want to drop the socket.
      this.sock?.end(undefined)
    } catch {
      /* ignore */
    }
    this.sock = undefined
  }
}

/** Map a Baileys content-type key to our filter's `type` vocabulary. */
function mapType(
  contentType: keyof proto.IMessage | undefined,
  content: proto.IMessage
): string {
  switch (contentType) {
    case 'conversation':
    case 'extendedTextMessage':
      return 'chat'
    case 'imageMessage':
      return 'image'
    case 'videoMessage':
      return 'video'
    case 'audioMessage':
      return content.audioMessage?.ptt ? 'ptt' : 'audio'
    case 'documentMessage':
      return 'document'
    case 'stickerMessage':
      return 'sticker'
    default:
      // protocolMessage, reactionMessage, senderKeyDistributionMessage, etc.
      return 'protocol' // dropped by the message filter as a system notification
  }
}

function isMediaContent(contentType: keyof proto.IMessage | undefined): boolean {
  return (
    contentType === 'imageMessage' ||
    contentType === 'videoMessage' ||
    contentType === 'audioMessage'
  )
}

export function sessionDataPath(): string {
  return join(app.getPath('userData'), 'whatsapp-session')
}
