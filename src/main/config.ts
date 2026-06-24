import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { RiskLevel } from '@shared/types'

export interface ScamCategoryDef {
  id: string
  desc: string
}

export interface ScamConfig {
  version: number
  updatedAt: string
  systemPrompt: string
  categories: ScamCategoryDef[]
  instructions: string
  thresholds: { notifyAtOrAbove: RiskLevel }
}

/**
 * Resolve the scam-pattern config. An OTA-updated copy in userData wins over the
 * version bundled in the app, so new scam tactics ship without an app release.
 */
export function configPaths(): { bundled: string; override: string } {
  const bundled = app.isPackaged
    ? join(process.resourcesPath, 'config', 'scam-patterns.json')
    : join(app.getAppPath(), 'resources', 'config', 'scam-patterns.json')
  const override = join(app.getPath('userData'), 'config', 'scam-patterns.json')
  return { bundled, override }
}

/** The editable system prompt lives in its own text file (bundled + OTA override). */
export function promptPaths(): { bundled: string; override: string } {
  const base = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  return {
    bundled: join(base, 'config', 'system-prompt.txt'),
    override: join(app.getPath('userData'), 'config', 'system-prompt.txt')
  }
}

function loadSystemPrompt(): string {
  const { bundled, override } = promptPaths()
  const path = existsSync(override) ? override : bundled
  return readFileSync(path, 'utf-8').trim()
}

export function loadScamConfig(): ScamConfig {
  const { bundled, override } = configPaths()
  let cfg = JSON.parse(readFileSync(bundled, 'utf-8')) as ScamConfig
  if (existsSync(override)) {
    try {
      const overrideCfg = JSON.parse(readFileSync(override, 'utf-8')) as ScamConfig
      // Only accept an override that is newer.
      if (overrideCfg.version > cfg.version) cfg = overrideCfg
    } catch {
      // Corrupt override: fall back to bundled.
    }
  }
  // The system prompt is sourced from system-prompt.txt, not the JSON.
  cfg.systemPrompt = loadSystemPrompt()
  return cfg
}
