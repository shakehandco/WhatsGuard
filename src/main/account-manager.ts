import { rm } from 'fs/promises'
import type { AccountID, AccountMeta, AggregateStatus } from '@shared/account-types'
import type { IncomingMessage, VerdictRecord, SessionState } from '@shared/types'
import { WhatsAppBridge, sessionDataPath } from './whatsapp-bridge'
import { ChatHistory } from './chat-history'
import { Store } from './store'
import { isSafeListedSender, filterMessage } from './message-filter'
import { logSystem, logActivity, type ActivityEntry } from './logger'
import type { Classifier } from './classifier'
import type { RiskEngine } from './risk-engine'

export interface AccountManagerDeps {
  store: Store
  /** Resolved lazily — the classifier/supervisor may be recreated on model switch. */
  getClassifier: () => Classifier | undefined
  getRiskEngine: () => RiskEngine | undefined
  /** Called when a verdict should be surfaced to the renderer. */
  onAlert: (accountId: AccountID, record: VerdictRecord) => void
  /** Called when any account's session state changes. */
  onSessionState: (accountId: AccountID, state: SessionState) => void
  /** Called when the aggregate status across all accounts changes. */
  onAggregateChange: (status: AggregateStatus) => void
}

/**
 * Owns the lifecycle of all WhatsApp accounts: create, delete, start, stop,
 * message routing, and per-account state (ChatHistory, active bridge).
 */
export class AccountManager {
  private readonly bridges = new Map<AccountID, WhatsAppBridge>()
  private readonly histories = new Map<AccountID, ChatHistory>()
  private readonly bridgeStarted = new Set<AccountID>()
  private readonly deps: AccountManagerDeps
  private closing = false

  constructor(deps: AccountManagerDeps) {
    this.deps = deps
  }

  // ── bridge lookup ──

  getBridge(id: AccountID): WhatsAppBridge | undefined {
    return this.bridges.get(id)
  }

  // ── lifecycle ──

  /** Restore bridges for all accounts that have given consent. */
  async restoreAll(): Promise<void> {
    const store = this.deps.store
    for (const acc of store.listAccounts()) {
      // Create the bridge object for every known account (it stays idle until started).
      const bridge = this.ensureBridge(acc.id)
      this.histories.set(acc.id, new ChatHistory())
      if (acc.consentAt) {
        this.deps.onSessionState(acc.id, bridge.getState())
        await this.startAccount(acc.id)
      }
    }
    this.emitAggregate()
  }

  /** Create a new account, persist it, and return its metadata. */
  async create(label: string): Promise<AccountMeta> {
    const acc = this.deps.store.createAccount(label)
    const bridge = this.ensureBridge(acc.id)
    this.histories.set(acc.id, new ChatHistory())
    return this.meta(acc.id)
  }

  /** Delete an account: disconnect, wipe session, wipe store data. */
  async deleteAccount(id: AccountID): Promise<void> {
    await this.disconnectAccount(id)
    // Delete the WhatsApp session cache from disk.
    await rm(sessionDataPath(id), { recursive: true, force: true })
    this.bridges.delete(id)
    this.histories.delete(id)
    this.bridgeStarted.delete(id)
    this.deps.store.deleteAccount(id)
    this.emitAggregate()
  }

  /** Start the bridge for an account (idempotent). */
  async startAccount(id: AccountID): Promise<void> {
    if (this.bridgeStarted.has(id)) return
    this.bridgeStarted.add(id)
    const bridge = this.bridges.get(id)
    if (!bridge) return
    try {
      await bridge.start()
    } catch (err) {
      logSystem('ERROR', 'bridge', `failed to start account ${id}: ${String(err)}`)
    }
  }

  /** Disconnect (unlink) an account and reset its consent. */
  async disconnectAccount(id: AccountID): Promise<void> {
    const bridge = this.bridges.get(id)
    await bridge?.disconnect()
    await rm(sessionDataPath(id), { recursive: true, force: true }).catch(() => {})
    this.bridgeStarted.delete(id)
    // Replace with a fresh, non-closing bridge so a re-scan can happen.
    this.ensureBridge(id)
    this.histories.get(id)?.clear()
    this.deps.store.resetAccount(id)
  }

  // ── message handling ──

  /** Route an incoming message through the full pipeline for a given account. */
  handleMessage(accountId: AccountID, msg: IncomingMessage): void {
    const safeList = this.deps.store.getSafeList(accountId)
    if (isSafeListedSender(msg, safeList)) return
    this.histories.get(accountId)?.record(msg)
    const result = filterMessage(msg, safeList)
    if (!result.pass) {
      logActivity({
        chatId: msg.chatId,
        sender: msg.sender,
        senderName: msg.senderName,
        type: msg.type,
        body: msg.body.slice(0, 4000),
        isGroup: msg.chatId.endsWith('@g.us'),
        decision: 'dropped',
        filterReason: result.reason
      })
      return
    }
    void this.analyse(accountId, msg)
  }

  private async analyse(accountId: AccountID, msg: IncomingMessage): Promise<void> {
    const classifier = this.deps.getClassifier()
    const riskEngine = this.deps.getRiskEngine()
    if (!classifier || !riskEngine) return
    const context = this.histories.get(accountId)?.context(msg.chatId) ?? []
    const base: Omit<ActivityEntry, 'decision'> = {
      chatId: msg.chatId,
      sender: msg.sender,
      senderName: msg.senderName,
      type: msg.type,
      body: msg.body.slice(0, 4000),
      isGroup: msg.chatId.endsWith('@g.us')
    }
    try {
      const verdict = await classifier.classify(msg, context)
      logActivity({ ...base, decision: 'analysed', verdict })
      const record = riskEngine.process(msg, verdict)
      if (record) {
        this.deps.store.addVerdict(accountId, record)
        this.deps.onAlert(accountId, record)
        logSystem('INFO', 'alert', `${record.verdict.risk}/${record.verdict.category} from ${msg.senderName} (account ${accountId})`)
      }
    } catch (err) {
      logActivity({ ...base, decision: 'not_analysed', note: String(err) })
      logSystem('WARN', 'analyse', `skipped account ${accountId}: ${String(err)}`)
    }
  }

  // ── aggregate status ──

  /** Compute the aggregate status across all accounts. */
  aggregate(): AggregateStatus {
    let total = 0
    let ready = 0
    let needsAttention = false
    for (const acc of this.deps.store.listAccounts()) {
      total++
      const bridge = this.bridges.get(acc.id)
      const state = bridge?.getState()
      if (state?.status === 'ready') ready++
      if (state?.status === 'disconnected' || state?.status === 'auth_failure') {
        needsAttention = true
      }
    }
    return { total, ready, needsAttention }
  }

  private emitAggregate(): void {
    this.deps.onAggregateChange(this.aggregate())
  }

  // ── metadata ──

  /** Build a live AccountMeta for one account. */
  meta(id: AccountID): AccountMeta {
    const acc = this.deps.store.getAccount(id)!
    const bridge = this.bridges.get(id)
    return {
      id: acc.id,
      label: acc.label,
      phoneNumber: bridge?.getNumber() ?? null,
      sessionState: bridge?.getState() ?? { status: 'initializing' }
    }
  }

  /** List metadata for all accounts. */
  listMeta(): AccountMeta[] {
    return this.deps.store.listAccounts().map((a) => this.meta(a.id))
  }

  // ── internals ──

  private ensureBridge(id: AccountID): WhatsAppBridge {
    const existing = this.bridges.get(id)
    if (existing && !this.isBridgeDead(id)) return existing
    const bridge = new WhatsAppBridge({
      sessionDataPath: sessionDataPath(id),
      onSessionState: (state) => {
        this.deps.onSessionState(id, state)
        this.emitAggregate()
      },
      onMessage: (msg) => this.handleMessage(id, msg)
    })
    this.bridges.set(id, bridge)
    return bridge
  }

  /** True if the bridge was intentionally destroyed (reset). */
  private isBridgeDead(id: AccountID): boolean {
    return !this.bridgeStarted.has(id)
  }

  /** Shut down all bridges (app quit). */
  async destroyAll(): Promise<void> {
    this.closing = true
    for (const [, bridge] of this.bridges) {
      await bridge.destroy().catch(() => {})
    }
    this.bridges.clear()
    this.histories.clear()
    this.bridgeStarted.clear()
  }
}
