import { SELECTABLE_MODELS, type ModelTier, type SessionState, type VerdictRecord } from '@shared/types'
import { t, LANGS, LANG_LOCALE, type Lang } from '@shared/i18n'
import { runWizard } from './wizard'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

let lang: Lang = 'en'
let lastSession: SessionState = { status: 'initializing' }
let modelTier: ModelTier = 'e4b'

const statusText = $('status-text')
const statusDot = $('status-dot')
const qrArea = $('qr-area')
const qrImg = $<HTMLImageElement>('qr-img')
const alertsList = $<HTMLUListElement>('alerts-list')
const alertsEmpty = $('alerts-empty')

/** Format the sender's phone number, or fall back to name (e.g. hidden @lid ids). */
function formatContact(rec: VerdictRecord): string {
  // Legacy records (saved before the schema added `sender`) have no sender —
  // fall back to the name rather than crashing the whole alerts render.
  if (rec.sender?.endsWith('@s.whatsapp.net')) {
    const digits = rec.sender.split('@')[0].replace(/\D/g, '')
    const phone = digits ? `+${digits}` : ''
    return rec.senderName && rec.senderName !== rec.sender
      ? `${rec.senderName} · ${phone}`
      : phone || t(lang, 'alerts_unknown')
  }
  return rec.senderName || t(lang, 'alerts_unknown')
}

/** Localized date-time, e.g. "10/06, 14:32". timestamp is epoch seconds. */
function formatTime(tsSeconds: number): string {
  return new Intl.DateTimeFormat(LANG_LOCALE[lang], {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(tsSeconds * 1000))
}

function renderSession(state: SessionState): void {
  lastSession = state
  statusText.textContent = t(lang, `status_${state.status}`)
  statusDot.dataset.status = state.status
  const showQr = state.status === 'qr' && Boolean(state.qr)
  qrArea.hidden = !showQr
  if (showQr && state.qr) qrImg.src = state.qr
}

function renderAlerts(records: VerdictRecord[]): void {
  alertsList.innerHTML = ''
  const active = records.filter((r) => !r.dismissed)
  alertsEmpty.hidden = active.length > 0
  for (const rec of active) {
    const li = document.createElement('li')
    li.className = `alert risk-${rec.verdict.risk}`

    const reason = document.createElement('p')
    reason.className = 'alert-reason'
    reason.textContent = rec.verdict.plain_reason

    const meta = document.createElement('p')
    meta.className = 'alert-meta muted'
    meta.textContent = `${formatContact(rec)} · ${formatTime(rec.timestamp)}`

    const dismiss = document.createElement('button')
    dismiss.textContent = t(lang, 'alerts_dismiss')
    dismiss.onclick = async (): Promise<void> => {
      await window.whatsguard.dismissAlert(rec.id, true)
      await refreshAlerts()
    }
    li.append(reason, meta, dismiss)
    alertsList.append(li)
  }
}

async function refreshAlerts(): Promise<void> {
  renderAlerts(await window.whatsguard.listAlerts())
}

/** Max safe-list rows shown before collapsing into a "+N more" line. */
const MAX_VISIBLE_SAFE = 10

/** Validate/normalise "country code + number" to +E.164 digits, or null. */
function normalizeSafeNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return null // E.164 bounds
  return `+${digits}`
}

function renderSafeList(numbers: string[]): void {
  const list = $<HTMLUListElement>('safelist-list')
  const empty = $('safelist-empty')
  const more = $('safelist-more')
  list.innerHTML = ''
  empty.hidden = numbers.length > 0

  for (const num of numbers.slice(0, MAX_VISIBLE_SAFE)) {
    const li = document.createElement('li')
    li.className = 'safelist-item'

    const span = document.createElement('span')
    span.className = 'safelist-num'
    span.textContent = num

    const rm = document.createElement('button')
    rm.type = 'button'
    rm.className = 'link-danger'
    rm.textContent = t(lang, 'safelist_remove')
    rm.onclick = async (): Promise<void> => {
      await window.whatsguard.removeSafeNumber(num)
      await refreshSafeList()
    }

    li.append(span, rm)
    list.append(li)
  }

  const hidden = numbers.length - MAX_VISIBLE_SAFE
  more.hidden = hidden <= 0
  if (hidden > 0) more.textContent = t(lang, 'safelist_more', { count: hidden })
}

async function refreshSafeList(): Promise<void> {
  renderSafeList(await window.whatsguard.getSafeList())
}

function wireSafeList(): void {
  const input = $<HTMLInputElement>('safelist-input')
  const addBtn = $<HTMLButtonElement>('safelist-add-btn')
  const error = $('safelist-error')

  const submit = async (): Promise<void> => {
    const normalized = normalizeSafeNumber(input.value)
    if (!normalized) {
      error.textContent = t(lang, 'safelist_invalid')
      error.hidden = false
      return
    }
    error.hidden = true
    await window.whatsguard.addSafeNumber(normalized)
    input.value = ''
    await refreshSafeList()
  }

  addBtn.onclick = (): void => void submit()
  input.onkeydown = (e): void => {
    if (e.key === 'Enter') void submit()
  }
}

/** Human-readable label for the model's runtime health. */
function modelHealthLabel(present: boolean, health: string): string {
  if (!present) return t(lang, 'sysinfo_model_missing')
  return t(lang, `model_health_${health}`)
}

async function refreshSystemInfo(): Promise<void> {
  const info = await window.whatsguard.getSystemInfo()
  const dl = $<HTMLDListElement>('sysinfo-list')
  dl.innerHTML = ''

  const row = (label: string, value: string, openLogs = false): void => {
    const dt = document.createElement('dt')
    dt.textContent = label
    const dd = document.createElement('dd')
    if (openLogs) {
      const path = document.createElement('span')
      path.className = 'sysinfo-path'
      path.textContent = value
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'link'
      btn.textContent = t(lang, 'sysinfo_open')
      btn.onclick = (): void => void window.whatsguard.openLogs()
      dd.append(path, btn)
    } else {
      dd.textContent = value
    }
    dl.append(dt, dd)
  }

  row(
    t(lang, 'sysinfo_model'),
    `${info.modelName} · ${modelHealthLabel(info.modelPresent, info.modelHealth)}`
  )
  row(
    t(lang, 'sysinfo_whatsapp'),
    info.whatsappNumber ?? t(lang, 'sysinfo_whatsapp_unlinked')
  )
  row(t(lang, 'sysinfo_rules_updated'), info.scamRulesUpdatedAt)
  row(t(lang, 'sysinfo_version'), info.appVersion)
  row(t(lang, 'sysinfo_logs'), info.logsDir, true)
}

function wireQuit(): void {
  $<HTMLButtonElement>('quit-btn').onclick = (): void => {
    if (window.confirm(t(lang, 'quit_confirm'))) void window.whatsguard.quitApp()
  }
}

function wireDisconnect(): void {
  $<HTMLButtonElement>('disconnect-btn').onclick = async (): Promise<void> => {
    if (!window.confirm(t(lang, 'disconnect_confirm'))) return
    await window.whatsguard.disconnect()
    // Consent is now wiped; reload re-runs init() into the first-run wizard.
    window.location.reload()
  }
}

/** Render the model radio options, marking the active tier. */
function renderModelOptions(): void {
  const wrap = $('model-opts')
  wrap.innerHTML = ''
  for (const m of SELECTABLE_MODELS) {
    const label = document.createElement('label')
    label.className = 'model-opt'

    const input = document.createElement('input')
    input.type = 'radio'
    input.name = 'model'
    input.value = m.tier
    input.checked = m.tier === modelTier
    input.onchange = (): void => {
      if (input.checked) void selectModel(m.tier)
    }

    const body = document.createElement('span')
    body.className = 'model-opt-body'
    const name = document.createElement('span')
    name.className = 'model-opt-name'
    name.textContent = m.label
    const desc = document.createElement('span')
    desc.className = 'model-opt-desc muted'
    desc.textContent =
      `${t(lang, `model_blurb_${m.tier}`)} · ` +
      t(lang, 'wiz_model_spec', { size: m.downloadGB, ram: m.minRamGB })
    body.append(name, desc)

    label.append(input, body)
    wrap.append(label)
  }
}

/** Switch the active model (downloads on demand in the main process). */
async function selectModel(tier: ModelTier): Promise<void> {
  if (tier === modelTier) return
  modelTier = tier
  const status = $('model-status')
  status.hidden = false
  status.textContent = t(lang, 'model_switching')
  await window.whatsguard.setModelTier(tier)
}

/** Subscribe to download/switch progress for the model card. */
function wireModel(): void {
  const wrap = $('model-progress-wrap')
  const bar = $('model-bar')
  const pct = $('model-pct')
  const status = $('model-status')
  window.whatsguard.onModelProgress((p) => {
    wrap.hidden = false
    bar.style.width = p.ratio >= 0 ? `${Math.round(p.ratio * 100)}%` : '0%'
    pct.textContent = p.ratio >= 0 ? `${Math.round(p.ratio * 100)}%` : ''
  })
  window.whatsguard.onModelStatus((s) => {
    if (s.phase === 'downloading') {
      status.hidden = false
      status.textContent = t(lang, 'model_switching')
    } else if (s.phase === 'done') {
      wrap.hidden = true
      status.hidden = false
      status.textContent = t(lang, 'model_ready')
      void refreshSystemInfo()
    } else if (s.phase === 'error') {
      wrap.hidden = true
      status.hidden = false
      status.textContent = t(lang, 'model_error')
    }
  })
}

/** Switch between the Home and Settings tabs. */
function showTab(tab: 'home' | 'settings'): void {
  const isHome = tab === 'home'
  $('tab-home').hidden = !isHome
  $('tab-settings').hidden = isHome
  const homeBtn = $<HTMLButtonElement>('tab-home-btn')
  const settingsBtn = $<HTMLButtonElement>('tab-settings-btn')
  homeBtn.classList.toggle('active', isHome)
  settingsBtn.classList.toggle('active', !isHome)
  homeBtn.setAttribute('aria-selected', String(isHome))
  settingsBtn.setAttribute('aria-selected', String(!isHome))
  // Refresh live values (model health, linked number) when Settings opens.
  if (!isHome) void refreshSystemInfo()
}

function wireTabs(): void {
  $<HTMLButtonElement>('tab-home-btn').onclick = (): void => showTab('home')
  $<HTMLButtonElement>('tab-settings-btn').onclick = (): void => showTab('settings')
}

/** Apply translations to static dashboard text (called on load + language change). */
function applyStaticText(): void {
  $('tagline').textContent = t(lang, 'tagline')
  $('alerts-title').textContent = t(lang, 'alerts_title')
  alertsEmpty.textContent = t(lang, 'alerts_empty')
  $('qr-instructions').textContent = t(lang, 'qr_instructions')

  $('tab-home-btn').textContent = t(lang, 'tab_home')
  $('tab-settings-btn').textContent = t(lang, 'tab_settings')

  $('safelist-title').textContent = t(lang, 'safelist_title')
  $('safelist-lead').textContent = t(lang, 'safelist_lead')
  $('safelist-empty').textContent = t(lang, 'safelist_empty')
  $('safelist-add-btn').textContent = t(lang, 'safelist_add')
  $<HTMLInputElement>('safelist-input').placeholder = t(lang, 'safelist_placeholder')

  $('model-title').textContent = t(lang, 'model_title')
  $('model-lead').textContent = t(lang, 'model_lead')
  renderModelOptions()

  $('sysinfo-title').textContent = t(lang, 'sysinfo_title')
  $('disconnect-title').textContent = t(lang, 'disconnect_title')
  $('disconnect-lead').textContent = t(lang, 'disconnect_lead')
  $('disconnect-btn').textContent = t(lang, 'disconnect_button')
  $('quit-title').textContent = t(lang, 'quit_title')
  $('quit-lead').textContent = t(lang, 'quit_lead')
  $('quit-btn').textContent = t(lang, 'quit_button')

  $('company-credit').textContent = t(lang, 'company_credit')

  renderSession(lastSession)
}

function buildLangSelect(): void {
  const sel = $<HTMLSelectElement>('lang-select')
  sel.innerHTML = ''
  for (const { code, label } of LANGS) {
    const opt = document.createElement('option')
    opt.value = code
    opt.textContent = label
    if (code === lang) opt.selected = true
    sel.append(opt)
  }
  sel.onchange = async (): Promise<void> => {
    lang = sel.value as Lang
    await window.whatsguard.setLanguage(lang)
    applyStaticText()
    await refreshAlerts()
    await refreshSafeList()
    await refreshSystemInfo()
  }
}

async function showDashboard(): Promise<void> {
  $('wizard').hidden = true
  $('dashboard').hidden = false
  buildLangSelect()
  applyStaticText()
  modelTier = await window.whatsguard.getModelTier()
  wireTabs()
  wireSafeList()
  wireQuit()
  wireDisconnect()
  wireModel()
  renderModelOptions()
  showTab('home')
  renderSession(await window.whatsguard.getSessionState())
  window.whatsguard.onSessionState(renderSession)
  window.whatsguard.onAlert(() => void refreshAlerts())
  // Model health and the linked number change as the app connects — refresh
  // system info on each session-state change so the card stays current.
  window.whatsguard.onSessionState(() => void refreshSystemInfo())
  await refreshAlerts()
  await refreshSafeList()
  await refreshSystemInfo()
}

async function init(): Promise<void> {
  lang = await window.whatsguard.getLanguage()
  const ob = await window.whatsguard.getOnboardingState()
  if (ob.consentGiven && ob.modelPresent) {
    await showDashboard()
  } else {
    $('wizard').hidden = false
    $('dashboard').hidden = true
    runWizard(ob, lang, () => void showDashboard())
  }
}

void init()
