import { deflateSync } from 'zlib'

/**
 * Generates the tray status icon as an in-memory PNG — a filled, antialiased
 * dot in the status colour. Keeps the tray asset-free on Windows/Linux the same
 * way the glyph title does on macOS: `nativeImage.createEmpty()` renders an
 * INVISIBLE tray icon on Windows, and `Tray.setTitle` is macOS-only, so those
 * platforms need a real image.
 *
 * Hand-rolled encoder rather than a canvas dependency: a PNG is just zlib
 * (already in Node) plus chunk framing, and the raw-BGRA alternative
 * (`nativeImage.createFromBitmap`) has a platform-dependent byte order.
 */

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(8 + body.length)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), 4 + body.length)
  return out
}

export type Rgba = readonly [r: number, g: number, b: number, a: number]

/**
 * A `size`×`size` PNG of a filled circle in `color`, transparent elsewhere.
 * Deterministic for given inputs.
 */
export function circlePng(size: number, color: Rgba): Buffer {
  const [r, g, b, a] = color
  // One filter byte (0 = None) per scanline, then RGBA pixels.
  const raw = Buffer.alloc(size * (1 + size * 4))
  const center = (size - 1) / 2
  const radius = size / 2 - 1.5
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4) + 1
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - center, y - center)
      // ~1px linear falloff at the rim antialiases the edge.
      const coverage = Math.min(1, Math.max(0, radius + 0.5 - dist))
      const i = row + x * 4
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
      raw[i + 3] = Math.round(a * coverage)
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  // bytes 10-12 (compression, filter, interlace) stay 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}
