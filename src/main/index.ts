import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { rm, statfs } from 'fs/promises'
import { join } from 'path'
import { IPC } from '@shared/ipc'
import type { IncomingMessage, ModelTier, SessionState } from '@shared/types'
import { WhatsAppBridge, sessionDataPath } from './whatsapp-bridge'
import { filterMessage, isSafeListedSender } from './message-filter'
import { ChatHistory } from './chat-history'
import { Store } from './store'
import {
  DEFAULT_TIER,
  detectHardware,
  effectiveTier,
  ensureModel,
  isModelPresent,
  llamaBinaryPath,
  modelFileName,
  mmprojPath,
  modelPath
} from './model-manager'
import { loadScamConfig } from './config'
import { Classifier } from './classifier'
import { LlamaSupervisor } from './llm-supervisor'
import { RiskEngine } from './risk-engine'
import { TrayController } from './tray'
import { clearLogs, initLogs, logActivity, logSystem, logsDir, type ActivityEntry } from './logger'
import { initAutoUpdate } from './updater'
import { normalizeLang, type Lang } from '@shared/i18n'

// Safety net: a stray async rejection (e.g. a transient Baileys socket error)
// must not crash the background monitor. Log it; the bridge's own reconnect
// logic handles connection drops.
process.on('unhandledRejection', (reason) => {
  const msg =
    reason instanceof Error ? `${reason.message}\n${reason.stack ?? ''}` : String(reason)
  logSystem('ERROR', 'unhandledRejection', msg.split('\n')[0])
})

// Windows toast notifications are silently dropped unless the process declares
// an AppUserModelID matching the Start-menu shortcut's — electron-builder's NSIS
// installer stamps the shortcut with the appId from electron-builder.yml, so the
// two strings must stay in sync. Must run before any Notification is created.
if (process.platform === 'win32') app.setAppUserModelId('app.whatsguard.desktop')

let mainWindow: BrowserWindow | undefined
let bridge: WhatsAppBridge | undefined
let store: Store | undefined
let supervisor: LlamaSupervisor | undefined
let classifier: Classifier | undefined
let riskEngine: RiskEngine | undefined
let tray: TrayController | undefined
let isQuitting = false
let bridgeStarted = false
let currentLang: Lang = 'en'
// Active model tier (4B/12B). Resolved at startup from the stored choice, the
// hardware recommendation, or whatever model is already on disk.
let currentTier: ModelTier = DEFAULT_TIER
// Date the active scam-rules config was last updated (shown in System info).
let scamRulesUpdatedAt = ''
const history = new ChatHistory()

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 720,
    show: false,
    title: 'WhatsGuard',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Tray app: the close button hides the window; monitoring keeps running.
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function sendToRenderer(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

/** Common audit-log fields for a message. */
function activityBase(msg: IncomingMessage): Omit<ActivityEntry, 'decision'> {
  return {
    chatId: msg.chatId,
    sender: msg.sender,
    senderName: msg.senderName,
    type: msg.type,
    body: msg.body.slice(0, 4000),
    isGroup: msg.chatId.endsWith('@g.us')
  }
}

/** New incoming message → filter → classify (event-driven LLM) → risk decision. */
function onIncomingMessage(msg: IncomingMessage): void {
  const safeList = store?.getSafeList() ?? []
  // Trusted contacts are fully private: never buffer them in history, never write
  // them to the activity log, never analyse them. Bail before any of that.
  if (isSafeListedSender(msg, safeList)) return
  history.record(msg)
  const result = filterMessage(msg, safeList)
  if (!result.pass) {
    logActivity({ ...activityBase(msg), decision: 'dropped', filterReason: result.reason })
    return
  }
  void analyse(msg)
}

async function analyse(msg: IncomingMessage): Promise<void> {
  if (!supervisor || !classifier || !riskEngine || !store) return
  const context = history.context(msg.chatId)
  try {
    await supervisor.ensureStarted() // warm the model on demand
    const verdict = await classifier.classify(msg, context)
    logActivity({ ...activityBase(msg), decision: 'analysed', verdict })
    const record = riskEngine.process(msg, verdict)
    if (record) {
      store.addVerdict(record)
      sendToRenderer(IPC.newAlert, record)
      logSystem('INFO', 'alert', `${record.verdict.risk}/${record.verdict.category} from ${msg.senderName}`)
    }
  } catch (err) {
    // Degrade gracefully — a model/inference failure must not crash monitoring.
    logActivity({ ...activityBase(msg), decision: 'not_analysed', note: String(err) })
    logSystem('WARN', 'analyse', `skipped: ${String(err)}`)
  }
}

function onSessionState(state: SessionState): void {
  logSystem('INFO', 'session', `${state.status}${state.detail ? ` — ${state.detail}` : ''}`)
  sendToRenderer(IPC.sessionStateChanged, state)
  tray?.update(state) // red icon + native notification on disconnect
}

/**
 * Begin protecting: start the WhatsApp bridge (so messages flow) and warm the
 * model if present. Idempotent. Called only AFTER consent — we never read
 * messages before the user has agreed.
 */
async function startProtection(): Promise<void> {
  if (supervisor?.preflight().ok) {
    supervisor.ensureStarted().catch((err) => logSystem('ERROR', 'llm', `could not start: ${String(err)}`))
  } else {
    logSystem('WARN', 'llm', 'model not present yet — classification deferred until downloaded')
  }
  if (bridgeStarted || !bridge) return
  bridgeStarted = true
  try {
    await bridge.start()
  } catch (err) {
    logSystem('ERROR', 'bridge', `failed to start: ${String(err)}`)
    onSessionState({ status: 'disconnected', detail: String(err) })
  }
}

/**
 * Factory reset: unlink the WhatsApp number and erase all local data. The user
 * confirms in the renderer before this runs. The downloaded model is kept (it is
 * not tied to the number and is costly to re-fetch). Afterwards the renderer
 * reloads into the first-run wizard; re-consenting there restarts protection.
 */
async function disconnectAndReset(): Promise<void> {
  logSystem('INFO', 'disconnect', 'user requested disconnect & erase')
  await bridge?.disconnect() // unlink device (best-effort) + drop socket
  await rm(sessionDataPath(), { recursive: true, force: true }) // WhatsApp session cache
  clearLogs()
  store?.reset() // verdicts + safe-list + consent + language
  history.clear() // in-memory chat context

  // Reset runtime state so the wizard's re-consent can start cleanly: a fresh,
  // non-closing bridge with bridgeStarted cleared (otherwise startProtection
  // early-returns and the QR never appears).
  bridgeStarted = false
  bridge = new WhatsAppBridge({
    sessionDataPath: sessionDataPath(),
    onSessionState,
    onMessage: onIncomingMessage
  })
  currentLang = detectOsLang()
  tray?.refreshMenu()
  tray?.update(bridge.getState())
}

/** Construct a supervisor pointed at a given tier's GGUF + projector. */
function buildSupervisor(tier: ModelTier): LlamaSupervisor {
  return new LlamaSupervisor({
    binaryPath: llamaBinaryPath(),
    modelPath: modelPath(tier),
    mmprojPath: mmprojPath(tier), // enables scam-image analysis when present
    // Room for the prompt (+ image) AND a long thinking phase before the JSON,
    // so a verdict isn't truncated to finish=length (must exceed classifier max_tokens).
    contextSize: 8192,
    // The 12B is costly to load + warm up, so keep it resident much longer to
    // avoid paying that on every sparse message; the small models unload sooner.
    idleUnloadMs: tier === '12b' ? 30 * 60_000 : 5 * 60_000
  })
}

/** Download a model tier (defaults to the active one), streaming progress. */
async function runModelDownload(tier: ModelTier = currentTier): Promise<void> {
  sendToRenderer(IPC.modelStatus, { phase: 'downloading' })
  // Log free disk up front — running out of space is a common cross-machine failure.
  try {
    const { bsize, bavail } = await statfs(app.getPath('userData'))
    logSystem('INFO', 'model', `starting download (tier ${tier}); free disk ${(bsize * bavail / 1e9).toFixed(1)} GB`)
  } catch {
    /* statfs unavailable — non-fatal */
  }
  try {
    await ensureModel(tier, {
      onProgress: (p) => sendToRenderer(IPC.modelProgress, p),
      onLog: (m) => logSystem('WARN', 'model', m)
    })
    sendToRenderer(IPC.modelStatus, { phase: 'done' })
    logSystem('INFO', 'model', `download complete and verified (tier ${tier})`)
    supervisor?.ensureStarted().catch((err) => logSystem('ERROR', 'llm', String(err)))
  } catch (err) {
    logSystem('ERROR', 'model', `download failed: ${String(err)}`)
    sendToRenderer(IPC.modelStatus, { phase: 'error', detail: String(err) })
  }
}

/**
 * Switch the active model tier: persist the choice, point inference at the new
 * GGUF, downloading it first if it isn't on disk yet, then (re)start the server.
 * The classifier reads `supervisor` lazily, so reassigning it is enough.
 */
async function switchModel(tier: ModelTier): Promise<void> {
  if (tier === currentTier && isModelPresent(tier)) return
  logSystem('INFO', 'llm', `switching model tier → ${tier}`)
  currentTier = tier
  store?.setModelTier(tier)
  await supervisor?.stop()
  supervisor = buildSupervisor(tier)
  if (isModelPresent(tier)) {
    sendToRenderer(IPC.modelStatus, { phase: 'done' })
    supervisor.ensureStarted().catch((err) => logSystem('ERROR', 'llm', `could not start: ${String(err)}`))
  } else {
    await runModelDownload(tier)
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.getSessionState, () => bridge?.getState() ?? { status: 'initializing' })
  ipcMain.handle(IPC.getOnboardingState, () => ({
    consentGiven: store?.hasConsent() ?? false,
    modelPresent: isModelPresent(currentTier)
  }))
  ipcMain.handle(IPC.recordConsent, () => {
    store?.recordConsent()
    void startProtection() // safe to read messages now
  })
  ipcMain.handle(IPC.startModelDownload, (_e, tier?: ModelTier) => {
    if (tier) {
      currentTier = tier
      store?.setModelTier(tier)
      supervisor = buildSupervisor(tier) // point inference at the chosen tier
    }
    void runModelDownload(currentTier)
  })
  ipcMain.handle(IPC.listAlerts, () => store?.listVerdicts() ?? [])
  ipcMain.handle(IPC.dismissAlert, (_e, id: string, wasFalsePositive: boolean) => {
    const rec = store?.listVerdicts().find((v) => v.id === id)
    store?.dismissVerdict(id)
    if (rec) riskEngine?.recordDismissal(rec.verdict.category, wasFalsePositive)
  })
  ipcMain.handle(IPC.purgeAll, () => store?.purgeVerdicts())
  ipcMain.handle(IPC.getSafeList, () => store?.getSafeList() ?? [])
  ipcMain.handle(IPC.addSafeNumber, (_e, num: string) => store?.addSafeNumber(num))
  ipcMain.handle(IPC.removeSafeNumber, (_e, num: string) => store?.removeSafeNumber(num))
  ipcMain.handle(IPC.getHardwareInfo, () => detectHardware())
  ipcMain.handle(IPC.getSystemInfo, () => {
    const tier = currentTier
    return {
      appVersion: app.getVersion(),
      modelName: modelFileName(tier),
      modelTier: tier,
      modelPresent: isModelPresent(tier),
      modelHealth: supervisor?.getHealth() ?? 'stopped',
      whatsappNumber: bridge?.getNumber() ?? null,
      scamRulesUpdatedAt,
      logsDir: logsDir(),
      dataDir: store?.dataDir() ?? ''
    }
  })
  ipcMain.handle(IPC.openLogs, () => void shell.openPath(logsDir()))
  ipcMain.handle(IPC.quitApp, () => {
    // Graceful shutdown: before-quit stops the model + bridge + tray cleanly.
    isQuitting = true
    app.quit()
  })
  ipcMain.handle(IPC.disconnect, () => disconnectAndReset())
  ipcMain.handle(IPC.getModelTier, () => currentTier)
  ipcMain.handle(IPC.setModelTier, (_e, tier: ModelTier) => switchModel(tier))
  ipcMain.handle(IPC.getLanguage, () => currentLang)
  ipcMain.handle(IPC.setLanguage, (_e, lang: Lang) => {
    currentLang = lang
    store?.setLanguage(lang)
    tray?.refreshMenu()
    if (bridge) tray?.update(bridge.getState()) // refresh tooltip in new language
  })
}

/**
 * Best-effort OS UI language. In a packaged macOS app `app.getLocale()` keys off
 * the bundle's declared localizations and falls back to English, so we prefer the
 * OS's ordered preferred-language list (independent of the app) and only treat a
 * candidate as English when it really is.
 */
function detectOsLang(): Lang {
  const candidates = [
    ...(app.getPreferredSystemLanguages?.() ?? []),
    app.getSystemLocale?.() ?? '',
    app.getLocale()
  ]
  for (const c of candidates) {
    if (!c) continue
    const lang = normalizeLang(c)
    if (lang !== 'en' || /^en/i.test(c)) return lang
  }
  return 'en'
}

app.whenReady().then(async () => {
  initLogs()
  store = new Store()

  // Event-driven local LLM pipeline. MVP ships a single tier (E4B). Model may be
  // absent until the first-run wizard downloads it; preflight degrades gracefully.
  const config = loadScamConfig()
  scamRulesUpdatedAt = config.updatedAt
  // Resolve the active tier: the user's stored choice wins; otherwise fall back
  // to whatever model is already on disk / the hardware recommendation.
  currentTier = store.getModelTier() ?? effectiveTier()
  logSystem('INFO', 'llm', `model tier: ${currentTier}`)
  supervisor = buildSupervisor(currentTier)
  riskEngine = new RiskEngine(config)
  currentLang = store.getLanguage() ?? detectOsLang()
  // Endpoint + language are resolved lazily (both can change at runtime).
  classifier = new Classifier(config, {
    endpoint: () => supervisor!.endpoint(),
    language: () => currentLang,
    // The 12B is much slower (and warms up Metal on first use), so give it a far
    // longer budget than the 4B before aborting.
    timeoutMs: () => (currentTier === '12b' ? 300_000 : 90_000)
  })

  tray = new TrayController({
    onShowWindow: showWindow,
    onOpenLogs: () => void shell.openPath(logsDir()),
    onQuit: () => {
      isQuitting = true
      app.quit()
    },
    getLang: () => currentLang
  })
  tray.init()

  // Launch at login (packaged only, so dev runs don't touch login items).
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true })

  // Background in-app updates (packaged only; verified by Developer ID signature
  // + latest-mac.yml SHA-512). Quiet: downloads in background, installs on quit.
  initAutoUpdate(app.isPackaged)

  bridge = new WhatsAppBridge({
    sessionDataPath: sessionDataPath(),
    onSessionState,
    onMessage: onIncomingMessage
  })

  registerIpc()
  createWindow()

  // Only start reading WhatsApp once the user has consented. A returning,
  // already-onboarded user starts protecting immediately; a first-run user
  // sees the wizard, and consent (then download) drives startup via IPC.
  if (store.hasConsent()) {
    void startProtection()
  } else {
    logSystem('INFO', 'onboarding', 'awaiting consent — wizard will drive setup')
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Tray/menubar app: stay alive when the UI window is closed (Phase 3 adds tray).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    /* keep running in background on all platforms; no-op */
  }
})

app.on('before-quit', () => {
  isQuitting = true
  void supervisor?.stop()
  void bridge?.destroy()
  tray?.destroy()
})
