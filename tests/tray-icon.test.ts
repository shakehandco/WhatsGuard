import { describe, it, expect } from 'vitest'
import { inflateSync } from 'zlib'
import { circlePng, type Rgba } from '../src/main/tray-icon'

const GREEN: Rgba = [46, 160, 67, 255]
const RED: Rgba = [217, 48, 37, 255]

/** Slice the data of the sole IDAT chunk out of a single-IDAT PNG. */
function idatData(png: Buffer): Buffer {
  let off = 8 // skip signature
  while (off < png.length) {
    const len = png.readUInt32BE(off)
    const type = png.toString('ascii', off + 4, off + 8)
    if (type === 'IDAT') return png.subarray(off + 8, off + 8 + len)
    off += 12 + len
  }
  throw new Error('no IDAT chunk')
}

describe('circlePng', () => {
  it('emits a well-formed RGBA PNG of the requested size', () => {
    const png = circlePng(32, GREEN)
    // PNG signature
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
    // IHDR: width, height, bit depth 8, colour type 6 (RGBA)
    expect(png.toString('ascii', 12, 16)).toBe('IHDR')
    expect(png.readUInt32BE(16)).toBe(32)
    expect(png.readUInt32BE(20)).toBe(32)
    expect(png[24]).toBe(8)
    expect(png[25]).toBe(6)
  })

  it('paints the centre in the requested colour and the corners transparent', () => {
    const size = 32
    const raw = inflateSync(idatData(circlePng(size, GREEN)))
    expect(raw.length).toBe(size * (1 + size * 4))
    const px = (x: number, y: number): number[] => {
      const i = y * (1 + size * 4) + 1 + x * 4
      return [...raw.subarray(i, i + 4)]
    }
    expect(px(16, 16)).toEqual([...GREEN])
    expect(px(0, 0)[3]).toBe(0) // corner fully transparent
    expect(px(size - 1, size - 1)[3]).toBe(0)
  })

  it('is deterministic and colour-sensitive', () => {
    expect(circlePng(32, GREEN).equals(circlePng(32, GREEN))).toBe(true)
    expect(circlePng(32, GREEN).equals(circlePng(32, RED))).toBe(false)
  })
})
