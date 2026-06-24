import type { ChatMessage, IncomingMessage, RiskLevel, ScamCategory, Verdict } from '@shared/types'
import { LANGUAGE_NAMES, type Lang } from '@shared/i18n'
import type { ScamConfig } from './config'

const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high']

export interface ClassifierOptions {
  /**
   * Resolves the current llama-server base URL at call time. A function (not a
   * fixed string) because the supervisor may restart on a new port after an
   * idle-unload, e.g. () => 'http://127.0.0.1:8080'.
   */
  endpoint: () => string
  /** Model name to pass through (llama-server ignores it but the API expects it). */
  model?: string
  timeoutMs?: number
  /**
   * Token budget. Gemma 4 emits a thinking phase before the JSON; too small a
   * budget truncates mid-thought and yields empty content. Must be generous.
   */
  maxTokens?: number
  /** Resolves the language the plain_reason should be written in. */
  language?: () => Lang
}

/**
 * JSON schema constraining the model's output to exactly a Verdict. llama-server
 * compiles this to a grammar, so output is always parseable and the enums can't
 * be violated. Category enum is derived from the (OTA) config + none/other.
 */
export function buildVerdictSchema(config: ScamConfig): Record<string, unknown> {
  const categories = ['none', ...config.categories.map((c) => c.id), 'other']
  return {
    type: 'object',
    properties: {
      risk: { type: 'string', enum: RISK_LEVELS },
      category: { type: 'string', enum: categories },
      trigger: { type: 'string' },
      plain_reason: { type: 'string' }
    },
    required: ['risk', 'category', 'trigger', 'plain_reason'],
    additionalProperties: false
  }
}

/** OpenAI-style content parts (text and optional image) for one chat message. */
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

interface ChatTurn {
  role: 'system' | 'user'
  content: string | ContentPart[]
}

/** Build the system prompt from the (OTA-updatable) scam config. */
export function buildSystemPrompt(config: ScamConfig, lang: Lang = 'en'): string {
  const cats = config.categories.map((c) => `- ${c.id}: ${c.desc}`).join('\n')
  const langLine = `\n\nIMPORTANT: write the "plain_reason" field in ${LANGUAGE_NAMES[lang]}. Keep "category" and "risk" exactly as the allowed values.`
  return `${config.systemPrompt}\n\nScam categories:\n${cats}\n\n${config.instructions}${langLine}`
}

/** Render the rolling context + the message under analysis into a user turn. */
export function buildUserTurn(msg: IncomingMessage, context: ChatMessage[]): ChatTurn {
  const priorLines = context
    .filter((m) => m.id !== msg.id)
    .map((m) => `${m.fromMe ? 'You' : m.senderName || 'Them'}: ${m.body}`)
    .join('\n')
  const header = priorLines
    ? `Recent conversation (oldest first):\n${priorLines}\n\n`
    : ''
  const target =
    `Message to analyse — from "${msg.senderName}":\n` +
    (msg.body ? `"${msg.body}"` : '(no text)') +
    (msg.media ? `\n[an image is attached]` : '')

  const text = `${header}${target}`

  if (msg.media && msg.media.mimetype.startsWith('image/')) {
    return {
      role: 'user',
      content: [
        { type: 'text', text },
        {
          type: 'image_url',
          image_url: { url: `data:${msg.media.mimetype};base64,${msg.media.dataBase64}` }
        }
      ]
    }
  }
  return { role: 'user', content: text }
}

/**
 * Robustly parse the model's reply into a Verdict. Tolerates markdown fences and
 * surrounding prose. On any failure, returns a safe low/none verdict rather than
 * throwing — a parse error must never crash the pipeline or fake a high alert.
 */
export function parseVerdict(raw: string): Verdict {
  const fallback: Verdict = {
    risk: 'low',
    category: 'none',
    trigger: '',
    plain_reason: ''
  }
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return fallback
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(match[0])
  } catch {
    return fallback
  }
  const risk = RISK_LEVELS.includes(obj.risk as RiskLevel) ? (obj.risk as RiskLevel) : 'low'
  const category = (typeof obj.category === 'string' ? obj.category : 'none') as ScamCategory
  return {
    risk,
    category,
    trigger: typeof obj.trigger === 'string' ? obj.trigger : '',
    plain_reason: typeof obj.plain_reason === 'string' ? obj.plain_reason : ''
  }
}

export class Classifier {
  constructor(
    private readonly config: ScamConfig,
    private readonly opts: ClassifierOptions
  ) {}

  async classify(msg: IncomingMessage, context: ChatMessage[]): Promise<Verdict> {
    const turns: ChatTurn[] = [
      { role: 'system', content: buildSystemPrompt(this.config, this.opts.language?.() ?? 'en') },
      buildUserTurn(msg, context)
    ]
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 60_000)
    try {
      const resp = await fetch(`${this.opts.endpoint()}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.opts.model ?? 'gemma-4',
          messages: turns,
          temperature: 0,
          // Budget for the thinking phase + the JSON; too small → empty content.
          max_tokens: this.opts.maxTokens ?? 1024,
          // Constrain output to the Verdict shape (llama-server → grammar).
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'verdict', schema: buildVerdictSchema(this.config) }
          }
        }),
        signal: controller.signal
      })
      if (!resp.ok) throw new Error(`llama-server ${resp.status}`)
      const data = (await resp.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[]
      }
      const choice = data.choices?.[0]
      const content = choice?.message?.content ?? ''
      // Empty content means the thinking phase was truncated (finish=length).
      // Fail loudly rather than silently returning low/none, which would make a
      // possible scam look "safe". analyse() logs this as not_analysed.
      if (!content.trim()) {
        throw new Error(
          `empty verdict (finish=${choice?.finish_reason ?? '?'}) — raise maxTokens`
        )
      }
      return parseVerdict(content)
    } finally {
      clearTimeout(timeout)
    }
  }
}
