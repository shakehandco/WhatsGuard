import { Tray, Menu, Notification, nativeImage, app, type NativeImage } from 'electron'
import type { SessionState, SessionStatus } from '@shared/types'
import { t, type Lang } from '@shared/i18n'
import { circlePng, type Rgba } from './tray-icon'

/** Menubar glyph per session status (language-neutral). */
const STATUS_GLYPH: Record<SessionStatus, string> = {
  initializing: '○',
  qr: '◐',
  authenticated: '◐',
  ready: '●',
  disconnected: '⛔',
  auth_failure: '⛔'
}

/**
 * Status dot colour for platforms without menubar text (Windows/Linux), where
 * the glyph title above is unavailable (`setTitle` is macOS-only) and an empty
 * tray image is invisible.
 */
const STATUS_COLOR: Record<SessionStatus, Rgba> = {
  initializing: [154, 160, 166, 255], // grey — starting up
  qr: [245, 166, 35, 255], // amber — action needed to link
  authenticated: [245, 166, 35, 255],
  ready: [46, 160, 67, 255], // green — protecting
  disconnected: [217, 48, 37, 255], // red — monitoring stopped
  auth_failure: [217, 48, 37, 255]
}

/** macOS uses the empty-image + glyph-title trick; everywhere else needs a real icon. */
const USE_GLYPH_TITLE = process.platform === 'darwin'

function statusImage(status: SessionStatus): NativeImage {
  // 32px so Windows scales DOWN to the tray cell on HiDPI instead of up.
  return nativeImage.createFromBuffer(circlePng(32, STATUS_COLOR[status]))
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
    // Asset-free either way: macOS shows a glyph as menubar text next to an
    // empty image; Windows/Linux get a generated status-dot PNG instead.
    this.tray = USE_GLYPH_TITLE
      ? new Tray(nativeImage.createEmpty())
      : new Tray(statusImage('initializing'))
    this.tray.setToolTip('WhatsGuard')
    if (USE_GLYPH_TITLE) this.tray.setTitle('○')
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
    if (USE_GLYPH_TITLE) {
      this.tray.setTitle(STATUS_GLYPH[state.status] ?? '○')
    } else {
      this.tray.setImage(statusImage(state.status))
    }
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
