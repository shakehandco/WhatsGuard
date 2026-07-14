/** Centralised IPC channel names shared between main and preload. */
export const IPC = {
  // --- account CRUD (renderer -> main) ---
  accountList: 'account:list',
  accountCreate: 'account:create',
  accountDelete: 'account:delete',
  accountActivate: 'account:activate',
  accountRename: 'account:rename',

  // --- active-account scoped operations (renderer -> main) ---
  // The renderer sets which account is "active"; all subsequent per-account
  // handlers below operate on that active account.
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
  disconnect: 'whatsapp:disconnect',
  getOnboardingState: 'onboarding:get',
  recordConsent: 'onboarding:consent',
  startModelDownload: 'model:download',
  getModelTier: 'model:tier:get',
  setModelTier: 'model:tier:set',
  getLanguage: 'lang:get',
  setLanguage: 'lang:set',

  // main -> renderer (send/on)
  sessionStateChanged: 'session:changed',
  newAlert: 'alerts:new',
  modelProgress: 'model:progress',
  modelStatus: 'model:status',
  aggregateStatusChanged: 'aggregate:changed'
} as const
