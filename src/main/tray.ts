import { Tray, Menu, Notification, nativeImage, app } from 'electron'
import type { SessionState, SessionStatus } from '@shared/types'
import { t, type Lang } from '@shared/i18n'

/** Menubar glyph per session status (language-neutral). */
const STATUS_GLYPH: Record<SessionStatus, string> = {
  initializing: '○',
  qr: '◐',
  authenticated: '◐',
  ready: '●',
  disconnected: '⛔',
  auth_failure: '⛔'
}

/** Statuses that mean monitoring has silently stopped and the user must act. */
const NEEDS_ATTENTION: SessionStatus[] = ['disconnected', 'auth_failure']

export interface TrayControllerOptions {
  onShowWindow: () => void
  onOpenLogs: () => void
  onQuit: () => void
  /** Resolves the current language for tooltips, menu, and notifications. */
  getLang: () => Lang
}

/**
 * Owns the tray/menubar icon and couples it to the WhatsApp session. Because the
 * WhatsApp view is hidden, a dropped/invalidated session is otherwise invisible —
 * here the icon turns red AND a native OS notification is raised, prompting the
 * user to open the dashboard and re-scan the QR.
 */
export class TrayController {
  private tray?: Tray
  private prevStatus?: SessionStatus

  constructor(private readonly opts: TrayControllerOptions) {}

  init(): void {
    // Empty image + menubar title keeps us asset-free; the glyph conveys status.
    this.tray = new Tray(nativeImage.createEmpty())
    this.tray.setToolTip('WhatsGuard')
    this.tray.setTitle('○')
    this.refreshMenu()
    this.tray.on('click', () => this.opts.onShowWindow())
  }

  /** Rebuild the context menu in the current language (call on language change). */
  refreshMenu(): void {
    if (!this.tray) return
    const lang = this.opts.getLang()
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: t(lang, 'tray_open'), click: () => this.opts.onShowWindow() },
        { label: t(lang, 'tray_logs'), click: () => this.opts.onOpenLogs() },
        { type: 'separator' },
        { label: t(lang, 'tray_quit'), click: () => this.opts.onQuit() }
      ])
    )
  }

  update(state: SessionState): void {
    if (!this.tray) return
    const lang = this.opts.getLang()
    this.tray.setTitle(STATUS_GLYPH[state.status] ?? '○')
    this.tray.setToolTip(t(lang, `tray_tip_${state.status}`))

    // Fire a native notification only on the transition INTO an attention state,
    // so we prompt once per drop rather than nagging repeatedly.
    const entering =
      NEEDS_ATTENTION.includes(state.status) &&
      this.prevStatus !== undefined &&
      !NEEDS_ATTENTION.includes(this.prevStatus)
    if (entering) this.notifyDisconnected(lang)
    this.prevStatus = state.status
  }

  private notifyDisconnected(lang: Lang): void {
    if (!Notification.isSupported()) return
    const n = new Notification({
      title: t(lang, 'notif_title'),
      body: t(lang, 'notif_body'),
      silent: false
    })
    n.on('click', () => this.opts.onShowWindow())
    n.show()
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = undefined
  }
}

/** Set the macOS Dock visibility — a tray app can stay out of the Dock. */
export function configureActivationPolicy(): void {
  if (process.platform === 'darwin') {
    // Keep the Dock icon for now (self-protection users expect to find the app);
    // switch to app.dock.hide() if a pure menubar presence is preferred.
    void app
  }
}
