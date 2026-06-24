import type { OnboardingState, SessionState } from '@shared/types'
import { t, LANGS, type Lang } from '@shared/i18n'

const wg = (): Window['whatsguard'] => window.whatsguard
const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const fmtGB = (bytes: number): string => `${(bytes / 1e9).toFixed(1)} GB`

/**
 * First-run onboarding. Walks an elderly self-installer through welcome →
 * consent → model download → WhatsApp linking → done, then calls onComplete to
 * reveal the dashboard. Fully localized; the welcome screen offers a language
 * picker so a non-English speaker can switch before reading anything else.
 */
export function runWizard(initial: OnboardingState, initialLang: Lang, onComplete: () => void): void {
  const root = byId('wizard')
  let modelReady = initial.modelPresent
  let lang = initialLang

  const screen = (html: string): void => {
    root.innerHTML = `<div class="wiz-card">${html}</div>`
  }

  function welcome(): void {
    const opts = LANGS.map(
      (l) => `<option value="${l.code}"${l.code === lang ? ' selected' : ''}>${l.label}</option>`
    ).join('')
    screen(`
      <select id="w-lang" class="wiz-lang" aria-label="Language">${opts}</select>
      <h1>${t(lang, 'wiz_welcome_title')}</h1>
      <p class="lead">${t(lang, 'wiz_welcome_lead')}</p>
      <ul class="wiz-points">
        <li>${t(lang, 'wiz_welcome_p1')}</li>
        <li>${t(lang, 'wiz_welcome_p2')}</li>
        <li>${t(lang, 'wiz_welcome_p3')}</li>
      </ul>
      <button id="w-next" class="wiz-btn">${t(lang, 'wiz_welcome_cta')}</button>
    `)
    const sel = byId<HTMLSelectElement>('w-lang')
    sel.onchange = async (): Promise<void> => {
      lang = sel.value as Lang
      await wg().setLanguage(lang)
      welcome()
    }
    byId('w-next').onclick = consent
  }

  function consent(): void {
    screen(`
      <h1>${t(lang, 'wiz_consent_title')}</h1>
      <p class="lead">${t(lang, 'wiz_consent_lead')}</p>
      <p>${t(lang, 'wiz_consent_body')}</p>
      <label class="wiz-check"><input type="checkbox" id="w-agree" /> ${t(lang, 'wiz_consent_check')}</label>
      <button id="w-next" class="wiz-btn" disabled>${t(lang, 'wiz_consent_cta')}</button>
    `)
    const agree = byId<HTMLInputElement>('w-agree')
    const next = byId<HTMLButtonElement>('w-next')
    agree.onchange = (): void => {
      next.disabled = !agree.checked
    }
    next.onclick = async (): Promise<void> => {
      await wg().recordConsent()
      setup()
    }
  }

  function setup(): void {
    if (modelReady) {
      linking()
      return
    }
    screen(`
      <h1>${t(lang, 'wiz_setup_title')}</h1>
      <p class="lead">${t(lang, 'wiz_setup_lead')}</p>
      <div id="w-progress-wrap" hidden>
        <div class="wiz-bar"><div id="w-bar" class="wiz-bar-fill"></div></div>
        <p id="w-pct" class="muted">${t(lang, 'wiz_setup_starting')}</p>
      </div>
      <p id="w-err" class="wiz-err" hidden></p>
      <button id="w-dl" class="wiz-btn">${t(lang, 'wiz_setup_download')}</button>
      <button id="w-skip" class="wiz-skip">${t(lang, 'wiz_setup_skip')}</button>
    `)
    const dl = byId<HTMLButtonElement>('w-dl')
    const wrap = byId('w-progress-wrap')
    const bar = byId('w-bar')
    const pct = byId('w-pct')
    const err = byId('w-err')

    const offProgress = wg().onModelProgress((p) => {
      wrap.hidden = false
      if (p.ratio >= 0) {
        bar.style.width = `${Math.round(p.ratio * 100)}%`
        pct.textContent = `${Math.round(p.ratio * 100)}% — ${fmtGB(p.received)} / ${fmtGB(p.total)}`
      } else {
        pct.textContent = fmtGB(p.received)
      }
    })
    const offStatus = wg().onModelStatus((s) => {
      if (s.phase === 'done') {
        offProgress()
        offStatus()
        modelReady = true
        linking()
      } else if (s.phase === 'error') {
        err.hidden = false
        err.textContent = t(lang, 'wiz_setup_error')
        wrap.hidden = true
        dl.disabled = false
        dl.textContent = t(lang, 'wiz_setup_retry')
      }
    })
    dl.onclick = (): void => {
      dl.disabled = true
      err.hidden = true
      wrap.hidden = false
      void wg().startModelDownload()
    }
    // Always-available escape: don't trap the user if the download errors or
    // stalls. Any in-flight download keeps running in the background; if it
    // finishes later the model just becomes available. Proceed to linking.
    byId('w-skip').onclick = (): void => {
      offProgress()
      offStatus()
      linking()
    }
  }

  function linking(): void {
    let offSession = (): void => {}
    const render = (s: SessionState): void => {
      if (s.status === 'ready') {
        offSession()
        done()
        return
      }
      const qr = s.status === 'qr' && s.qr ? `<img class="wiz-qr" src="${s.qr}" alt="QR code" />` : `<p class="muted">${t(lang, 'wiz_link_preparing')}</p>`
      screen(`
        <h1>${t(lang, 'wiz_link_title')}</h1>
        <p class="lead">${t(lang, 'wiz_link_lead')}</p>
        ${qr}
        <p class="muted">${t(lang, 'wiz_link_waiting')}</p>
      `)
    }
    offSession = wg().onSessionState(render)
    void wg().getSessionState().then(render)
  }

  function done(): void {
    screen(`
      <h1>${t(lang, 'wiz_done_title')}</h1>
      <p class="lead">${t(lang, 'wiz_done_lead')}</p>
      <p>${t(lang, 'wiz_done_body')}</p>
      <button id="w-finish" class="wiz-btn">${t(lang, 'wiz_done_finish')}</button>
    `)
    byId('w-finish').onclick = onComplete
  }

  welcome()
}
