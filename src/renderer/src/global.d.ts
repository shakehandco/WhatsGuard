import type { WhatsGuardApi } from '@shared/types'

declare global {
  interface Window {
    whatsguard: WhatsGuardApi
  }
}

export {}
