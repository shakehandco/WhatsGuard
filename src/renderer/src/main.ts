import type { SessionState, VerdictRecord } from '@shared/types'
import { t, LANGS, LANG_LOCALE, type Lang } from '@shared/i18n'
import { runWizard } from './wizard'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

let lang: Lang = 'en'
let lastSession: SessionState = { status: 'initializing' }

const statusText = $('status-text')
const statusDot = $('status-dot')
const qrArea = $('qr-area')
const qrImg = $<HTMLImageElement>('qr-img')
const alertsList = $<HTMLUListElement>('alerts-list')
const alertsEmpty = $('alerts-empty')

/** Format the sender's phone number, or fall back to name (e.g. hidden @lid ids). */
function formatContact(rec: VerdictRecord): string {
  if (rec.sender.endsWith('@s.whatsapp.net')) {
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

/** Apply translations to static dashboard text (called on load + language change). */
function applyStaticText(): void {
  $('tagline').textContent = t(lang, 'tagline')
  $('alerts-title').textContent = t(lang, 'alerts_title')
  alertsEmpty.textContent = t(lang, 'alerts_empty')
  $('qr-instructions').textContent = t(lang, 'qr_instructions')
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
  }
}

async function showDashboard(): Promise<void> {
  $('wizard').hidden = true
  $('dashboard').hidden = false
  buildLangSelect()
  applyStaticText()
  renderSession(await window.whatsguard.getSessionState())
  window.whatsguard.onSessionState(renderSession)
  window.whatsguard.onAlert(() => void refreshAlerts())
  await refreshAlerts()
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
