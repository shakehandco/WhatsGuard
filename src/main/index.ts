import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { statfs } from 'fs/promises'
import { join } from 'path'
import { IPC } from '@shared/ipc'
import type { AccountID, AccountMeta } from '@shared/account-types'
import type { ModelTier, SessionState } from '@shared/types'
import { Store } from './store'
import { AccountManager } from './account-manager'
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
import { clearLogs, initLogs, logSystem, logsDir } from './logger'
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

let mainWindow: BrowserWindow | undefined
let store: Store | undefined
let accountManager: AccountManager | undefined
let supervisor: LlamaSupervisor | undefined
let classifier: Classifier | undefined
let riskEngine: RiskEngine | undefined
let tray: TrayController | undefined
let isQuitting = false
let currentLang: Lang = 'en'
// Active model tier (4B/12B). Resolved at startup from the stored choice, the
// hardware recommendation, or whatever model is already on disk.
let currentTier: ModelTier = DEFAULT_TIER
// Date the active scam-rules config was last updated (shown in System info).
let scamRulesUpdatedAt = ''
/** The account the renderer is currently viewing. */
let activeAccountId: AccountID | null = null

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

/** Session state changed for a specific account — forward to renderer + tray. */
function onSessionState(accountId: AccountID, state: SessionState): void {
  logSystem('INFO', 'session', `[${accountId}] ${state.status}${state.detail ? ` — ${state.detail}` : ''}`)
  // Only forward session state for the active account to avoid confusing the UI.
  if (accountId === activeAccountId) {
    sendToRenderer(IPC.sessionStateChanged, state)
  }
  tray?.updateAggregate(accountManager?.aggregate() ?? { total: 0, ready: 0, needsAttention: false })
}

/**
 * Begin protecting the active account: start its bridge and warm the model.
 * Idempotent. Called only AFTER consent — we never read messages before the
 * user has agreed.
 */
async function startProtection(): Promise<void> {
  if (!activeAccountId || !accountManager) return
  if (supervisor?.preflight().ok) {
    supervisor.ensureStarted().catch((err) => logSystem('ERROR', 'llm', `could not start: ${String(err)}`))
  } else {
    logSystem('WARN', 'llm', 'model not present yet — classification deferred until downloaded')
  }
  await accountManager.startAccount(activeAccountId)
}

/**
 * Factory reset for the active account: unlink WhatsApp, erase local data,
 * and reset the bridge so a fresh QR can be scanned. If no accounts remain,
 * the renderer reloads into the first-run wizard.
 */
async function disconnectAndReset(): Promise<void> {
  if (!activeAccountId || !accountManager) return
  logSystem('INFO', 'disconnect', `user requested disconnect & erase for account ${activeAccountId}`)
  await accountManager.disconnectAccount(activeAccountId)

  // If this was the last account, go back to the first-run wizard.
  if (accountManager.listMeta().length === 0) {
    clearLogs()
    activeAccountId = null
    sendToRenderer(IPC.sessionStateChanged, { status: 'initializing' })
    return
  }

  // Otherwise switch to the first remaining account.
  const remaining = accountManager.listMeta()
  activeAccountId = remaining[0]?.id ?? null
  const bridge = activeAccountId ? accountManager.getBridge(activeAccountId) : undefined
  if (bridge) {
    sendToRenderer(IPC.sessionStateChanged, bridge.getState())
    tray?.updateAggregate(accountManager.aggregate())
  }
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
  // --- account CRUD ---
  ipcMain.handle(IPC.accountList, (): AccountMeta[] => accountManager?.listMeta() ?? [])
  ipcMain.handle(IPC.accountCreate, async (_e, label: string): Promise<AccountMeta> => {
    const meta = await accountManager!.create(label)
    // Auto-activate the newly created account.
    activeAccountId = meta.id
    return meta
  })
  ipcMain.handle(IPC.accountDelete, async (_e, id: AccountID): Promise<void> => {
    await accountManager?.deleteAccount(id)
    if (activeAccountId === id) {
      const remaining = accountManager?.listMeta() ?? []
      activeAccountId = remaining[0]?.id ?? null
    }
  })
  ipcMain.handle(IPC.accountActivate, (_e, id: AccountID): void => {
    activeAccountId = id
    // Push the new account's session state to the renderer immediately.
    const bridge = accountManager?.getBridge(id)
    if (bridge) sendToRenderer(IPC.sessionStateChanged, bridge.getState())
  })
  ipcMain.handle(IPC.accountRename, (_e, id: AccountID, label: string): void => {
    store?.renameAccount(id, label)
  })

  // --- active-account scoped ---
  ipcMain.handle(IPC.getSessionState, () => {
    if (!activeAccountId) return { status: 'initializing' as const }
    return accountManager?.getBridge(activeAccountId)?.getState() ?? { status: 'initializing' as const }
  })
  ipcMain.handle(IPC.getOnboardingState, () => ({
    consentGiven: activeAccountId ? (store?.hasConsent(activeAccountId) ?? false) : false,
    modelPresent: isModelPresent(currentTier)
  }))
  ipcMain.handle(IPC.recordConsent, () => {
    if (activeAccountId) {
      store?.recordConsent(activeAccountId)
      void startProtection()
    }
  })
  ipcMain.handle(IPC.startModelDownload, (_e, tier?: ModelTier) => {
    if (tier) {
      currentTier = tier
      store?.setModelTier(tier)
      supervisor = buildSupervisor(tier) // point inference at the chosen tier
    }
    void runModelDownload(currentTier)
  })
  ipcMain.handle(IPC.listAlerts, () => {
    if (!activeAccountId) return []
    return store?.listVerdicts(activeAccountId) ?? []
  })
  ipcMain.handle(IPC.dismissAlert, (_e, id: string, wasFalsePositive: boolean) => {
    if (!activeAccountId) return
    const rec = store?.listVerdicts(activeAccountId).find((v) => v.id === id)
    store?.dismissVerdict(activeAccountId, id)
    if (rec) riskEngine?.recordDismissal(rec.verdict.category, wasFalsePositive)
  })
  ipcMain.handle(IPC.purgeAll, () => {
    if (activeAccountId) store?.purgeVerdicts(activeAccountId)
  })
  ipcMain.handle(IPC.getSafeList, () => {
    if (!activeAccountId) return []
    return store?.getSafeList(activeAccountId) ?? []
  })
  ipcMain.handle(IPC.addSafeNumber, (_e, num: string) => {
    if (activeAccountId) store?.addSafeNumber(activeAccountId, num)
  })
  ipcMain.handle(IPC.removeSafeNumber, (_e, num: string) => {
    if (activeAccountId) store?.removeSafeNumber(activeAccountId, num)
  })
  ipcMain.handle(IPC.getHardwareInfo, () => detectHardware())
  ipcMain.handle(IPC.getSystemInfo, () => {
    const tier = currentTier
    const bridge = activeAccountId ? accountManager?.getBridge(activeAccountId) : undefined
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
    timeoutMs: () => (currentTier === '12b' ? 300_000 : 90_000)
  })

  // Multi-account manager: routes messages per-account, owns bridge lifecycle.
  accountManager = new AccountManager({
    store,
    getClassifier: () => classifier,
    getRiskEngine: () => riskEngine,
    onAlert: (accountId, record) => {
      // Only surface alerts for the active account.
      if (accountId === activeAccountId) sendToRenderer(IPC.newAlert, record)
    },
    onSessionState,
    onAggregateChange: (status) => {
      sendToRenderer(IPC.aggregateStatusChanged, status)
      tray?.updateAggregate(status)
    }
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

  // Restore all consenting accounts at startup.
  await accountManager.restoreAll()

  // Set the active account to the first one (if any).
  const accounts = accountManager.listMeta()
  activeAccountId = accounts[0]?.id ?? null

  registerIpc()
  createWindow()

  // Auto-start protection for the active account if it already has consent.
  if (activeAccountId && store.hasConsent(activeAccountId)) {
    void startProtection()
  } else {
    logSystem('INFO', 'onboarding', 'awaiting consent — wizard will drive setup')
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Tray/menubar app: stay alive when the UI window is closed.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    /* keep running in background on all platforms; no-op */
  }
})

app.on('before-quit', async () => {
  isQuitting = true
  await supervisor?.stop()
  await accountManager?.destroyAll()
  tray?.destroy()
})
