import { createHash } from 'crypto'
import { createReadStream, createWriteStream, existsSync, statSync } from 'fs'
import { mkdir, rename, unlink } from 'fs/promises'
import { dirname } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

/** One place a file can be fetched from, with the hash THOSE bytes must match. */
export interface DownloadSource {
  url: string
  /** Lower-case hex SHA-256 the bytes at THIS url MUST match. */
  sha256: string
  /** Expected size in bytes, if known (used for progress + resume sanity). */
  sizeBytes?: number
}

/**
 * What to download. Either a single source (flat, the common case) or a list of
 * failover `sources` tried in order.
 *
 * Each source carries its OWN sha256/size on purpose: mirrors are rarely
 * byte-identical across HuggingFace repos (an independent re-quantise of the
 * same model has different bytes), so a shared checksum would reject every
 * fallback. A source succeeds only when its downloaded bytes match its own hash.
 */
export type DownloadSpec = DownloadSource | { sources: DownloadSource[] }

/** Normalise either spec shape to the ordered source list. */
export function downloadSources(spec: DownloadSpec): DownloadSource[] {
  return 'sources' in spec ? spec.sources : [spec]
}

export interface DownloadProgress {
  received: number
  total: number
  /** 0..1, or -1 when total is unknown. */
  ratio: number
}

export interface DownloadOptions {
  onProgress?: (p: DownloadProgress) => void
  signal?: AbortSignal
  /** Network-drop retries before giving up (each resumes via Range). */
  maxRetries?: number
  /** Diagnostic log sink (per-attempt failures, sizes) — wired to system.log. */
  onLog?: (msg: string) => void
}

/** Node fetch errors are opaque ("fetch failed"); surface the underlying cause. */
function describeError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause
    const causeStr =
      cause instanceof Error
        ? ` (cause: ${cause.message}${(cause as { code?: string }).code ? ` [${(cause as { code?: string }).code}]` : ''})`
        : cause
          ? ` (cause: ${String(cause)})`
          : ''
    return `${err.message}${causeStr}`
  }
  return String(err)
}

/** Stream a file through SHA-256 and return the lower-case hex digest. */
export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

/**
 * Download a model with resumable Range requests and mandatory checksum
 * verification. The file lands at `${destPath}.part` and is only renamed to its
 * final path AFTER its SHA-256 matches the source it came from — so the
 * supervisor can never be pointed at a truncated/corrupt GGUF (which would
 * segfault llama.cpp and trap the app in a reboot loop).
 *
 * With multiple `sources`, each is tried in order; the first that both downloads
 * and verifies wins. Network drops retry (with resume) WITHIN a source; a
 * checksum failure, HTTP error, or exhausted retries falls over to the NEXT
 * source. Throws only once every source has failed.
 */
export async function downloadModel(
  spec: DownloadSpec,
  destPath: string,
  options: DownloadOptions = {}
): Promise<void> {
  const { onLog, signal } = options
  const sources = downloadSources(spec)
  const partPath = `${destPath}.part`
  await mkdir(dirname(destPath), { recursive: true })
  if (sources.length === 0) throw new Error('no download sources provided')

  // Already present and matching ANY source's checksum? Nothing to do. (The
  // installed file could have come from any of the mirrors.)
  if (existsSync(destPath)) {
    const digest = await sha256File(destPath)
    if (sources.some((s) => s.sha256 === digest)) return
  }

  const failures: string[] = []
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]
    const label = `source ${i + 1}/${sources.length}`
    try {
      await downloadVerified(source, partPath, options)
      await rename(partPath, destPath)
      if (i > 0) onLog?.(`succeeded via ${label} (${source.url})`)
      return
    } catch (err) {
      if (signal?.aborted) throw err
      // The bytes in .part belong to THIS source. The next source is a different
      // file (different hash), so its resume would concatenate onto garbage —
      // discard the partial before failing over.
      await unlink(partPath).catch(() => undefined)
      const msg = describeError(err)
      failures.push(`${source.url}: ${msg}`)
      onLog?.(`${label} failed: ${msg}`)
    }
  }
  throw new Error(`all ${sources.length} download source(s) failed:\n${failures.join('\n')}`)
}

/**
 * Download a single source with resume-on-drop retries, then verify its
 * checksum. Leaves the verified bytes at `partPath`; throws (discarding a
 * corrupt partial) on checksum mismatch or once retries are exhausted.
 */
async function downloadVerified(
  source: DownloadSource,
  partPath: string,
  options: DownloadOptions
): Promise<void> {
  const { onProgress, signal, maxRetries = 5, onLog } = options
  let attempt = 0
  for (;;) {
    try {
      await downloadOnce(source, partPath, onProgress, signal)
      // A stream can end without error yet be short (CDN closed early). Treat a
      // truncated file as a retryable failure (resume) rather than letting it
      // fall through to a terminal checksum mismatch.
      const got = existsSync(partPath) ? statSync(partPath).size : 0
      if (source.sizeBytes && got < source.sizeBytes) {
        throw new Error(`incomplete: ${got} of ${source.sizeBytes} bytes`)
      }
      break
    } catch (err) {
      if (signal?.aborted) throw err
      attempt += 1
      onLog?.(`download attempt ${attempt} failed: ${describeError(err)}`)
      if (attempt > maxRetries) {
        throw new Error(`download failed after ${maxRetries} retries: ${describeError(err)}`)
      }
      // Brief backoff; the next attempt resumes from the partial file.
      await new Promise((r) => setTimeout(r, Math.min(1000 * attempt, 5000)))
    }
  }

  const digest = await sha256File(partPath)
  if (digest !== source.sha256) {
    await unlink(partPath).catch(() => undefined)
    throw new Error(
      `checksum mismatch: expected ${source.sha256}, got ${digest}. The download was ` +
        `corrupt and has been discarded.`
    )
  }
}

async function downloadOnce(
  source: DownloadSource,
  partPath: string,
  onProgress: DownloadOptions['onProgress'],
  signal?: AbortSignal
): Promise<void> {
  const existing = existsSync(partPath) ? statSync(partPath).size : 0

  let resp: Response
  try {
    resp = await fetch(source.url, {
      headers: existing > 0 ? { Range: `bytes=${existing}-` } : {},
      signal
    })
  } catch (err) {
    // Network-level failure (DNS, TLS, proxy, offline) — preserve the cause.
    throw new Error(`network error fetching ${source.url}: ${describeError(err)}`)
  }
  if (!resp.ok && resp.status !== 206) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} for ${source.url}`)
  }
  if (!resp.body) throw new Error('empty response body')

  // If we asked to resume but the server ignored Range (200, not 206), we must
  // restart from zero to avoid concatenating a fresh full body onto the partial.
  let resuming = existing > 0 && resp.status === 206
  if (resuming) {
    // Verify the 206 actually starts where we left off; a server that resumes at
    // the wrong offset would corrupt the file (the cause of a full-size hash
    // mismatch). If it doesn't, discard the partial and re-download from scratch.
    const m = /bytes (\d+)-/.exec(resp.headers.get('content-range') ?? '')
    if (!m || Number(m[1]) !== existing) {
      await unlink(partPath).catch(() => undefined)
      throw new Error(
        `bad resume range (expected start ${existing}, got "${resp.headers.get('content-range')}") — restarting`
      )
    }
  }
  const startByte = resuming ? existing : 0

  const contentLen = Number(resp.headers.get('content-length') ?? 0)
  const total = source.sizeBytes ?? (contentLen ? startByte + contentLen : 0)

  let received = startByte
  const out = createWriteStream(partPath, { flags: resuming ? 'a' : 'w' })
  const body = Readable.fromWeb(resp.body as Parameters<typeof Readable.fromWeb>[0])
  body.on('data', (chunk: Buffer) => {
    received += chunk.length
    onProgress?.({ received, total, ratio: total ? received / total : -1 })
  })
  await pipeline(body, out)
}
