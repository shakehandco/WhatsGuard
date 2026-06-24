import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { totalmem } from 'os'
import { join } from 'path'
import type { HardwareInfo, ModelTier } from '@shared/types'
import { downloadModel, type DownloadOptions, type DownloadSpec } from './model-downloader'

/** MVP ships a single tier for everyone: Gemma 4 E4B. */
export const DEFAULT_TIER: ModelTier = 'e4b'

/** Is the text model for a tier already downloaded? */
export function isModelPresent(tier: ModelTier): boolean {
  return existsSync(modelPath(tier))
}

/** Text GGUF filename per tier (downloaded into userData on first run). */
const MODEL_FILES: Record<ModelTier, string> = {
  e2b: 'gemma-4-E2B-it-Q4_K_M.gguf',
  e4b: 'gemma-4-E4B-it-Q4_K_M.gguf',
  '12b': 'gemma-4-12B-it-Q4_K_M.gguf'
}

/** Multimodal projector filename per tier (needed for image analysis). */
const MMPROJ_FILES: Record<ModelTier, string> = {
  e2b: 'mmproj-gemma-4-E2B-it-Q8_0.gguf',
  e4b: 'mmproj-gemma-4-E4B-it-Q8_0.gguf',
  '12b': 'mmproj-gemma-4-12B-it-Q8_0.gguf'
}

/** Path to the bundled llama-server binary (extraResources in production). */
export function llamaBinaryPath(): string {
  const name = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
  return app.isPackaged
    ? join(process.resourcesPath, 'bin', name)
    : join(app.getAppPath(), 'resources', 'bin', name)
}

/** Path to the text GGUF for a tier, under userData/models. */
export function modelPath(tier: ModelTier): string {
  return join(app.getPath('userData'), 'models', MODEL_FILES[tier])
}

/** Path to the multimodal projector for a tier, under userData/models. */
export function mmprojPath(tier: ModelTier): string {
  return join(app.getPath('userData'), 'models', MMPROJ_FILES[tier])
}

interface TierSpec {
  model: DownloadSpec
  mmproj: DownloadSpec
}
interface ModelManifest {
  tiers: Record<ModelTier, TierSpec>
}

function manifestPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'config', 'models-manifest.json')
    : join(app.getAppPath(), 'resources', 'config', 'models-manifest.json')
}

export function loadTierSpec(tier: ModelTier): TierSpec {
  const manifest = JSON.parse(readFileSync(manifestPath(), 'utf-8')) as ModelManifest
  return manifest.tiers[tier]
}

async function ensureFile(
  spec: DownloadSpec,
  dest: string,
  what: string,
  opts: DownloadOptions
): Promise<string> {
  if (!spec.sha256) {
    throw new Error(
      `No SHA-256 recorded for ${what} in models-manifest.json — refusing to download ` +
        `an unverifiable file.`
    )
  }
  await downloadModel(spec, dest, opts)
  return dest
}

/**
 * Ensure the text GGUF + multimodal projector for `tier` are present and
 * checksum-verified, downloading any that are missing. Refuses anything with no
 * known SHA-256 — we never install an unverifiable model. Returns both paths.
 */
export async function ensureModel(
  tier: ModelTier,
  opts: DownloadOptions = {}
): Promise<{ modelPath: string; mmprojPath: string }> {
  const spec = loadTierSpec(tier)
  const model = await ensureFile(spec.model, modelPath(tier), `tier "${tier}" model`, opts)
  const mmproj = await ensureFile(spec.mmproj, mmprojPath(tier), `tier "${tier}" mmproj`, opts)
  return { modelPath: model, mmprojPath: mmproj }
}

/**
 * Pick a model tier from available RAM. The 12B (~6.7GB Q4) needs real
 * headroom once Chromium + WhatsApp Web are also resident, so it is gated to
 * 16GB+; 8GB machines get the E4B edge variant; anything smaller, E2B.
 */
export function recommendTier(totalRamGB: number): ModelTier {
  if (totalRamGB >= 16) return '12b'
  if (totalRamGB >= 8) return 'e4b'
  return 'e2b'
}

/**
 * The tier to actually run. Prefers a tier whose model is already on disk (so we
 * use whatever was downloaded — e.g. E4B), falling back to the hardware
 * recommendation. This keeps an explicit model choice from being overridden by
 * RAM-based detection, and lets the future wizard's downloaded tier win.
 */
export function effectiveTier(): ModelTier {
  const recommended = recommendTier(Math.round((totalmem() / 1024 ** 3) * 10) / 10)
  if (existsSync(modelPath(recommended))) return recommended
  const present = (['e4b', '12b', 'e2b'] as ModelTier[]).find((t) => existsSync(modelPath(t)))
  return present ?? recommended
}

export function detectHardware(): HardwareInfo {
  const totalRamGB = Math.round((totalmem() / 1024 ** 3) * 10) / 10
  return {
    totalRamGB,
    // Disk check is wired in Phase 5's wizard; 0 is a "not yet measured" sentinel.
    freeDiskGB: 0,
    recommendedTier: recommendTier(totalRamGB)
  }
}
