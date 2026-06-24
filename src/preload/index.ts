import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  SessionState,
  VerdictRecord,
  WhatsGuardApi,
  HardwareInfo,
  OnboardingState,
  DownloadProgress,
  ModelStatus
} from '@shared/types'
import type { Lang } from '@shared/i18n'

const api: WhatsGuardApi = {
  getSessionState: () => ipcRenderer.invoke(IPC.getSessionState),
  onSessionState: (cb: (s: SessionState) => void) => {
    const listener = (_e: unknown, s: SessionState): void => cb(s)
    ipcRenderer.on(IPC.sessionStateChanged, listener)
    return () => ipcRenderer.removeListener(IPC.sessionStateChanged, listener)
  },
  onAlert: (cb: (r: VerdictRecord) => void) => {
    const listener = (_e: unknown, r: VerdictRecord): void => cb(r)
    ipcRenderer.on(IPC.newAlert, listener)
    return () => ipcRenderer.removeListener(IPC.newAlert, listener)
  },
  listAlerts: () => ipcRenderer.invoke(IPC.listAlerts),
  dismissAlert: (id: string, wasFalsePositive: boolean) =>
    ipcRenderer.invoke(IPC.dismissAlert, id, wasFalsePositive),
  purgeAll: () => ipcRenderer.invoke(IPC.purgeAll),
  getSafeList: () => ipcRenderer.invoke(IPC.getSafeList),
  addSafeNumber: (num: string) => ipcRenderer.invoke(IPC.addSafeNumber, num),
  removeSafeNumber: (num: string) => ipcRenderer.invoke(IPC.removeSafeNumber, num),
  getHardwareInfo: (): Promise<HardwareInfo> => ipcRenderer.invoke(IPC.getHardwareInfo),

  getOnboardingState: (): Promise<OnboardingState> => ipcRenderer.invoke(IPC.getOnboardingState),
  recordConsent: () => ipcRenderer.invoke(IPC.recordConsent),
  startModelDownload: () => ipcRenderer.invoke(IPC.startModelDownload),
  onModelProgress: (cb: (p: DownloadProgress) => void) => {
    const listener = (_e: unknown, p: DownloadProgress): void => cb(p)
    ipcRenderer.on(IPC.modelProgress, listener)
    return () => ipcRenderer.removeListener(IPC.modelProgress, listener)
  },
  onModelStatus: (cb: (s: ModelStatus) => void) => {
    const listener = (_e: unknown, s: ModelStatus): void => cb(s)
    ipcRenderer.on(IPC.modelStatus, listener)
    return () => ipcRenderer.removeListener(IPC.modelStatus, listener)
  },

  getLanguage: (): Promise<Lang> => ipcRenderer.invoke(IPC.getLanguage),
  setLanguage: (lang: Lang) => ipcRenderer.invoke(IPC.setLanguage, lang)
}

contextBridge.exposeInMainWorld('whatsguard', api)
