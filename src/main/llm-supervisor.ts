import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { createServer } from 'net'
import { logSystem } from './logger'

export interface SupervisorOptions {
  /** Path to the bundled llama-server binary. */
  binaryPath: string
  /** Path to the GGUF model selected for this machine's tier. */
  modelPath: string
  /** Optional multimodal projector; enables image analysis when present. */
  mmprojPath?: string
  host?: string
  contextSize?: number
  /** Stop the server after this many ms of inactivity to free RAM (0 = never). */
  idleUnloadMs?: number
  extraArgs?: string[]
  /** Consecutive failed starts before entering cooldown. */
  maxConsecutiveFailures?: number
  /** Cooldown after tripping the breaker, during which starts are refused. */
  cooldownMs?: number
}

export type SupervisorHealth = 'stopped' | 'starting' | 'ready' | 'cooldown'

/** Find an available localhost TCP port. */
function findFreePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, host, () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        const { port } = addr
        srv.close(() => resolve(port))
      } else {
        srv.close(() => reject(new Error('could not determine free port')))
      }
    })
  })
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Spawns and supervises the local llama-server child process.
 *
 * Inference is event-driven: the server can be unloaded after idle to free RAM
 * and is restarted on demand. Crucially it does NOT blindly restart on crash — a
 * corrupt GGUF makes llama.cpp exit immediately (often code 139, SIGSEGV), and a
 * naive restart-on-crash would trap the CPU in an infinite reboot loop. Instead a
 * circuit breaker trips after repeated rapid failures and refuses further starts
 * for a cooldown, surfacing the fault rather than thrashing.
 */
export class LlamaSupervisor {
  private proc?: ChildProcess
  private port?: number
  private starting?: Promise<void>
  private idleTimer?: NodeJS.Timeout
  private stopped = false
  private health: SupervisorHealth = 'stopped'
  private consecutiveFailures = 0
  private cooldownUntil = 0
  private lastExitCode: number | null = null
  private lastStderr = ''

  constructor(private readonly opts: SupervisorOptions) {}

  private get host(): string {
    return this.opts.host ?? '127.0.0.1'
  }

  endpoint(): string {
    if (!this.port) throw new Error('llama-server not started')
    return `http://${this.host}:${this.port}`
  }

  isRunning(): boolean {
    return Boolean(this.proc && this.proc.exitCode === null)
  }

  getHealth(): SupervisorHealth {
    if (this.cooldownUntil > Date.now()) return 'cooldown'
    return this.health
  }

  /** Diagnostics for the UI when the model won't load. */
  lastError(): { exitCode: number | null; stderr: string } {
    return { exitCode: this.lastExitCode, stderr: this.lastStderr.slice(-2000) }
  }

  /** Verify the prerequisites exist before attempting to spawn. */
  preflight(): { ok: boolean; reason?: string } {
    if (!existsSync(this.opts.binaryPath)) {
      return { ok: false, reason: `llama-server binary missing at ${this.opts.binaryPath}` }
    }
    if (!existsSync(this.opts.modelPath)) {
      return { ok: false, reason: `model file missing at ${this.opts.modelPath}` }
    }
    return { ok: true }
  }

  /** Start the server if not already running (idempotent / coalesced). */
  async ensureStarted(): Promise<void> {
    this.resetIdleTimer()
    if (this.isRunning()) return
    if (this.cooldownUntil > Date.now()) {
      const secs = Math.ceil((this.cooldownUntil - Date.now()) / 1000)
      throw new Error(
        `llama-server in cooldown for ${secs}s after repeated failures ` +
          `(last exit ${this.lastExitCode ?? 'n/a'}). The model file may be corrupt.`
      )
    }
    if (this.starting) return this.starting
    this.starting = this.start()
    try {
      await this.starting
      this.consecutiveFailures = 0
    } catch (err) {
      this.registerFailure()
      throw err
    } finally {
      this.starting = undefined
    }
  }

  private registerFailure(): void {
    this.consecutiveFailures += 1
    const max = this.opts.maxConsecutiveFailures ?? 3
    if (this.consecutiveFailures >= max) {
      this.cooldownUntil = Date.now() + (this.opts.cooldownMs ?? 5 * 60_000)
      this.consecutiveFailures = 0
      this.health = 'cooldown'
      logSystem(
        'ERROR',
        'llama',
        `circuit breaker tripped after ${max} failures; cooling down. ` +
          `Last exit ${this.lastExitCode}. Likely a corrupt model — re-verify the GGUF checksum.`
      )
    }
  }

  private async start(): Promise<void> {
    const pf = this.preflight()
    if (!pf.ok) throw new Error(pf.reason)

    this.health = 'starting'
    this.port = await findFreePort(this.host)
    const args = [
      '--model', this.opts.modelPath,
      '--host', this.host,
      '--port', String(this.port),
      '--ctx-size', String(this.opts.contextSize ?? 4096),
      // Multimodal projector — only if present (enables scam-image analysis).
      ...(this.opts.mmprojPath && existsSync(this.opts.mmprojPath)
        ? ['--mmproj', this.opts.mmprojPath]
        : []),
      ...(this.opts.extraArgs ?? [])
    ]
    this.stopped = false
    this.lastStderr = ''
    const proc = spawn(this.opts.binaryPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    this.proc = proc

    proc.stderr?.on('data', (chunk: Buffer) => {
      this.lastStderr += chunk.toString()
    })

    // Resolve when /health is OK; reject immediately if the process exits first
    // (segfault on a bad model exits in milliseconds — don't poll a corpse for 60s).
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const onExit = (code: number | null): void => {
        this.lastExitCode = code
        this.proc = undefined
        this.health = 'stopped'
        if (!settled && !this.stopped) {
          settled = true
          reject(
            new Error(
              `llama-server exited during startup (code ${code}). ` +
                (code === 139 ? 'Code 139 (SIGSEGV) usually means a corrupt/incompatible model.' : '')
            )
          )
        }
      }
      proc.once('exit', onExit)

      void (async (): Promise<void> => {
        try {
          await this.waitForHealth(() => settled || this.stopped)
          if (!settled) {
            settled = true
            proc.removeListener('exit', onExit)
            // Keep a passive exit listener for later crashes.
            proc.once('exit', (code) => {
              this.lastExitCode = code
              this.proc = undefined
              this.health = 'stopped'
              if (!this.stopped) logSystem('ERROR', 'llama', `exited (code ${code})`)
            })
            this.health = 'ready'
            resolve()
          }
        } catch (err) {
          if (!settled) {
            settled = true
            reject(err)
          }
        }
      })()
    })
  }

  private async waitForHealth(aborted: () => boolean, timeoutMs = 180_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (aborted()) return
      try {
        const resp = await fetch(`${this.endpoint()}/health`)
        if (resp.ok) return
      } catch {
        // not up yet
      }
      await sleep(500)
    }
    throw new Error('llama-server did not become healthy in time')
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    const ms = this.opts.idleUnloadMs ?? 0
    if (ms > 0) {
      this.idleTimer = setTimeout(() => void this.stop(), ms)
      this.idleTimer.unref?.()
    }
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.health = 'stopped'
    if (this.idleTimer) clearTimeout(this.idleTimer)
    const proc = this.proc
    this.proc = undefined
    if (proc && proc.exitCode === null) {
      proc.kill('SIGTERM')
    }
  }
}
