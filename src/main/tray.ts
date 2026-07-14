import { Tray, Menu, Notification, nativeImage, app } from 'electron'
import type { SessionState, SessionStatus } from '@shared/types'
import type { AggregateStatus } from '@shared/account-types'
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
  private prevNeedsAttention = false
  private aggregate: AggregateStatus = { total: 0, ready: 0, needsAttention: false }

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

  /**
   * Update the tray icon and tooltip from the aggregate status across all
   * accounts. Fires a native notification when any account transitions into
   * a disconnected/auth-failure state.
   */
  updateAggregate(status: AggregateStatus): void {
    if (!this.tray) return
    const lang = this.opts.getLang()

    // Glyph: ⛔ if any account needs attention, ● if all ready+connected,
    // ◐ if some are still linking, ○ if nothing running.
    if (status.total === 0) {
      this.tray.setTitle('○')
      this.tray.setToolTip('WhatsGuard')
    } else if (status.needsAttention) {
      this.tray.setTitle('⛔')
      this.tray.setToolTip(`WhatsGuard — ${status.ready}/${status.total} connected`)
    } else if (status.ready === status.total) {
      this.tray.setTitle('●')
      this.tray.setToolTip(`WhatsGuard — ${status.ready}/${status.total} protected`)
    } else {
      this.tray.setTitle('◐')
      this.tray.setToolTip(`WhatsGuard — ${status.ready}/${status.total} connecting`)
    }

    // Fire a native notification only when transitioning INTO needing attention.
    const entering = status.needsAttention && !this.prevNeedsAttention && status.total > 0
    if (entering) this.notifyDisconnected(lang)

    this.prevNeedsAttention = status.needsAttention
    this.aggregate = status
  }

  /** Kept for backward compatibility — delegates to aggregate. */
  update(state: SessionState): void {
    // Single-account update is no longer meaningful; no-op.
    // The caller should use updateAggregate instead.
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
