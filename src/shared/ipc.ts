/** Centralised IPC channel names shared between main and preload. */
export const IPC = {
  // renderer -> main (invoke/handle)
  getSessionState: 'session:get',
  listAlerts: 'alerts:list',
  dismissAlert: 'alerts:dismiss',
  purgeAll: 'store:purge',
  getSafeList: 'safelist:get',
  addSafeNumber: 'safelist:add',
  removeSafeNumber: 'safelist:remove',
  getHardwareInfo: 'hardware:get',
  getSystemInfo: 'system:get',
  openLogs: 'system:open-logs',
  quitApp: 'system:quit',
  getOnboardingState: 'onboarding:get',
  recordConsent: 'onboarding:consent',
  startModelDownload: 'model:download',
  getLanguage: 'lang:get',
  setLanguage: 'lang:set',

  // main -> renderer (send/on)
  sessionStateChanged: 'session:changed',
  newAlert: 'alerts:new',
  modelProgress: 'model:progress',
  modelStatus: 'model:status'
} as const
