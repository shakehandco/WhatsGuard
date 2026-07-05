import { autoUpdater } from 'electron-updater'
import { logSystem } from './logger'

/**
 * In-app updates via electron-updater (Squirrel.Mac under the hood).
 *
 * Trust model: there is NO Sparkle EdDSA key here. macOS auto-update is gated by
 * the app's Developer ID code signature — Squirrel.Mac refuses any update whose
 * signature doesn't match the installed app — and electron-updater additionally
 * verifies the SHA-512 recorded in `latest-mac.yml` against the downloaded bytes.
 * So the security of updates rides entirely on the signed/notarized release
 * pipeline producing immutable artifacts (see .github/workflows/release.yml).
 *
 * Behaviour is deliberately quiet for a background tray app aimed at elders:
 * download in the background, install on the next quit, never interrupt.
 */

const SIX_HOURS_MS = 6 * 60 * 60 * 1000

/**
 * Wire up background update checks. No-op when unpackaged (dev): electron-updater
 * has no `app-update.yml` to read and would throw. Failures are logged, never
 * thrown — a broken update channel must not affect scam monitoring.
 */
export function initAutoUpdate(isPackaged: boolean): void {
  if (!isPackaged) {
    logSystem('INFO', 'update', 'dev build — auto-update disabled')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // Route electron-updater's own logging into our system.log (no content).
  autoUpdater.logger = {
    info: (m: unknown) => logSystem('INFO', 'update', String(m)),
    warn: (m: unknown) => logSystem('WARN', 'update', String(m)),
    error: (m: unknown) => logSystem('ERROR', 'update', String(m)),
    debug: () => {}
  } as typeof autoUpdater.logger

  autoUpdater.on('update-available', (info) =>
    logSystem('INFO', 'update', `available: ${info.version}`)
  )
  autoUpdater.on('update-not-available', () => logSystem('INFO', 'update', 'up to date'))
  autoUpdater.on('error', (err) => logSystem('ERROR', 'update', String(err)))
  autoUpdater.on('update-downloaded', (info) =>
    logSystem('INFO', 'update', `downloaded ${info.version}; installs on next quit`)
  )

  const check = (): void => {
    autoUpdater
      .checkForUpdates()
      .catch((err) => logSystem('WARN', 'update', `check failed: ${String(err)}`))
  }

  check()
  const timer = setInterval(check, SIX_HOURS_MS)
  timer.unref?.()
}
