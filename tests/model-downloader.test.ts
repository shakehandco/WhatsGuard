import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'http'
import { createHash, randomBytes } from 'crypto'
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { downloadModel, sha256File } from '../src/main/model-downloader'

// A deterministic ~256KB payload acting as our "model".
const PAYLOAD = randomBytes(256 * 1024)
const GOOD_SHA = createHash('sha256').update(PAYLOAD).digest('hex')

let server: Server
let baseUrl: string

beforeAll(async () => {
  server = createServer((req, res) => {
    const range = req.headers['range']
    if (range) {
      const m = /bytes=(\d+)-/.exec(range)
      const start = m ? Number(m[1]) : 0
      const slice = PAYLOAD.subarray(start)
      res.writeHead(206, {
        'content-length': String(slice.length),
        'content-range': `bytes ${start}-${PAYLOAD.length - 1}/${PAYLOAD.length}`
      })
      res.end(slice)
    } else {
      res.writeHead(200, { 'content-length': String(PAYLOAD.length) })
      res.end(PAYLOAD)
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address()
  if (addr && typeof addr === 'object') baseUrl = `http://127.0.0.1:${addr.port}`
})

afterAll(() => server.close())

function tmpDest(): string {
  return join(mkdtempSync(join(tmpdir(), 'wg-dl-')), 'model.gguf')
}

describe('downloadModel', () => {
  it('downloads and verifies a correct checksum', async () => {
    const dest = tmpDest()
    await downloadModel({ url: `${baseUrl}/model`, sha256: GOOD_SHA }, dest)
    expect(existsSync(dest)).toBe(true)
    expect(await sha256File(dest)).toBe(GOOD_SHA)
    // The .part file is gone once renamed.
    expect(existsSync(`${dest}.part`)).toBe(false)
  })

  it('rejects and discards a file whose checksum is wrong', async () => {
    const dest = tmpDest()
    await expect(
      downloadModel({ url: `${baseUrl}/model`, sha256: 'deadbeef'.repeat(8) }, dest, { maxRetries: 0 })
    ).rejects.toThrow(/checksum mismatch/)
    // Corrupt file must not be left where the supervisor could load it.
    expect(existsSync(dest)).toBe(false)
    expect(existsSync(`${dest}.part`)).toBe(false)
  })

  it('resumes from a partial .part file via Range', async () => {
    const dest = tmpDest()
    // Pre-seed a partial download (first 100KB).
    writeFileSync(`${dest}.part`, PAYLOAD.subarray(0, 100 * 1024))
    await downloadModel({ url: `${baseUrl}/model`, sha256: GOOD_SHA }, dest)
    expect(readFileSync(dest).equals(PAYLOAD)).toBe(true)
  })

  it('reports progress', async () => {
    const dest = tmpDest()
    let lastRatio = 0
    await downloadModel({ url: `${baseUrl}/model`, sha256: GOOD_SHA }, dest, {
      onProgress: (p) => {
        lastRatio = p.ratio
      }
    })
    expect(lastRatio).toBeGreaterThan(0)
  })
})

describe('downloadModel — truncated stream', () => {
  let truncServer: Server
  let truncUrl: string
  const HALF = PAYLOAD.length / 2

  beforeAll(async () => {
    // First (non-Range) response ends early at HALF; the Range retry serves the rest.
    truncServer = createServer((req, res) => {
      const range = req.headers['range']
      if (range) {
        const start = Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0)
        res.writeHead(206, { 'content-range': `bytes ${start}-${PAYLOAD.length - 1}/${PAYLOAD.length}` })
        res.end(PAYLOAD.subarray(start))
      } else {
        res.writeHead(200) // no content-length; close after half
        res.end(PAYLOAD.subarray(0, HALF))
      }
    })
    await new Promise<void>((r) => truncServer.listen(0, '127.0.0.1', r))
    const addr = truncServer.address()
    if (addr && typeof addr === 'object') truncUrl = `http://127.0.0.1:${addr.port}`
  })
  afterAll(() => truncServer.close())

  it('treats a short stream as retryable and completes via resume', async () => {
    const dest = tmpDest()
    const logs: string[] = []
    await downloadModel(
      { url: `${truncUrl}/model`, sha256: GOOD_SHA, sizeBytes: PAYLOAD.length },
      dest,
      { onLog: (m) => logs.push(m) }
    )
    expect(readFileSync(dest).equals(PAYLOAD)).toBe(true)
    // The first attempt was logged as an "incomplete" retry, not a hard failure.
    expect(logs.some((l) => /incomplete/.test(l))).toBe(true)
  })
})
