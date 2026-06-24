import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { statfs } from 'fs/promises'
import { join } from 'path'
import { IPC } from '@shared/ipc'
import type { IncomingMessage, SessionState } from '@shared/types'
import { WhatsAppBridge, sessionDataPath } from './whatsapp-bridge'
import { filterMessage } from './message-filter'
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
import { initLogs, logActivity, logSystem, logsDir, type ActivityEntry } from './logger'
import { normalizeLang, type Lang } from '@shared/i18n'

// Safety net: a stray async rejection (e.g. a transient Baileys socket error)
// must not crash the background monitor. Log it; the bridge's own reconnect
// logic handles connection drops.
process.on('unhandledRejection', (reason) => {
  const msg =
    reason instanceof Error ? `${reason.message}\n${reason.stack ?? ''}` : String(reason)
  logSystem('ERROR', 'unhandledRejection', msg.split('\n')[0])
})

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
  history.record(msg)
  const result = filterMessage(msg, store?.getSafeList() ?? [])
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

/** First-run model download (E4B), streaming progress to the wizard. */
async function runModelDownload(): Promise<void> {
  sendToRenderer(IPC.modelStatus, { phase: 'downloading' })
  // Log free disk up front — running out of space is a common cross-machine failure.
  try {
    const { bsize, bavail } = await statfs(app.getPath('userData'))
    logSystem('INFO', 'model', `starting download (tier ${DEFAULT_TIER}); free disk ${(bsize * bavail / 1e9).toFixed(1)} GB`)
  } catch {
    /* statfs unavailable — non-fatal */
  }
  try {
    await ensureModel(DEFAULT_TIER, {
      onProgress: (p) => sendToRenderer(IPC.modelProgress, p),
      onLog: (m) => logSystem('WARN', 'model', m)
    })
    sendToRenderer(IPC.modelStatus, { phase: 'done' })
    logSystem('INFO', 'model', 'download complete and verified')
    supervisor?.ensureStarted().catch((err) => logSystem('ERROR', 'llm', String(err)))
  } catch (err) {
    logSystem('ERROR', 'model', `download failed: ${String(err)}`)
    sendToRenderer(IPC.modelStatus, { phase: 'error', detail: String(err) })
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.getSessionState, () => bridge?.getState() ?? { status: 'initializing' })
  ipcMain.handle(IPC.getOnboardingState, () => ({
    consentGiven: store?.hasConsent() ?? false,
    modelPresent: isModelPresent(DEFAULT_TIER)
  }))
  ipcMain.handle(IPC.recordConsent, () => {
    store?.recordConsent()
    void startProtection() // safe to read messages now
  })
  ipcMain.handle(IPC.startModelDownload, () => void runModelDownload())
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
    const tier = effectiveTier()
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
  ipcMain.handle(IPC.getLanguage, () => currentLang)
  ipcMain.handle(IPC.setLanguage, (_e, lang: Lang) => {
    currentLang = lang
    store?.setLanguage(lang)
    tray?.refreshMenu()
    if (bridge) tray?.update(bridge.getState()) // refresh tooltip in new language
  })
}

app.whenReady().then(async () => {
  initLogs()
  store = new Store()

  // Event-driven local LLM pipeline. MVP ships a single tier (E4B). Model may be
  // absent until the first-run wizard downloads it; preflight degrades gracefully.
  const config = loadScamConfig()
  scamRulesUpdatedAt = config.updatedAt
  logSystem('INFO', 'llm', `model tier: ${DEFAULT_TIER}`)
  supervisor = new LlamaSupervisor({
    binaryPath: llamaBinaryPath(),
    modelPath: modelPath(DEFAULT_TIER),
    mmprojPath: mmprojPath(DEFAULT_TIER), // enables scam-image analysis when present
    idleUnloadMs: 5 * 60_000
  })
  riskEngine = new RiskEngine(config)
  currentLang = store.getLanguage() ?? normalizeLang(app.getLocale())
  // Endpoint + language are resolved lazily (both can change at runtime).
  classifier = new Classifier(config, {
    endpoint: () => supervisor!.endpoint(),
    language: () => currentLang
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
