/**
 * Tiny i18n layer shared by main (tray/notifications) and renderer (wizard +
 * dashboard). Plus the LLM is instructed to write its plain-language scam reason
 * in the selected language (see LANGUAGE_NAMES + the classifier).
 */

export type Lang = 'en' | 'zh' | 'zh-Hant' | 'id' | 'de' | 'es'

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '简体中文' },
  { code: 'zh-Hant', label: '繁體中文' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' }
]

/** Human name used in the LLM prompt to set the output language. */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: 'English',
  zh: 'Simplified Chinese',
  'zh-Hant': 'Traditional Chinese',
  id: 'Bahasa Indonesia',
  de: 'German',
  es: 'Spanish'
}

/**
 * The language's own name in its own script. Pairing this with the English name
 * in the prompt (e.g. "Simplified Chinese (简体中文)") greatly improves the
 * model's adherence — the native token nudges it to actually switch languages.
 */
export const LANGUAGE_NATIVE: Record<Lang, string> = {
  en: 'English',
  zh: '简体中文',
  'zh-Hant': '繁體中文',
  id: 'Bahasa Indonesia',
  de: 'Deutsch',
  es: 'Español'
}

/** BCP-47 locale for Intl date formatting per language. */
export const LANG_LOCALE: Record<Lang, string> = {
  en: 'en-GB',
  zh: 'zh-CN',
  'zh-Hant': 'zh-TW',
  id: 'id-ID',
  de: 'de-DE',
  es: 'es-ES'
}

/** Map an OS locale string (app.getLocale / navigator.language) to a Lang. */
export function normalizeLang(locale: string | undefined): Lang {
  const l = (locale ?? '').toLowerCase()
  if (l.startsWith('zh')) {
    // Traditional for Taiwan/Hong Kong/Macau or an explicit Hant script tag;
    // everything else (zh, zh-CN, zh-Hans, zh-SG) is Simplified.
    if (/hant|tw|hk|mo/.test(l)) return 'zh-Hant'
    return 'zh'
  }
  if (l.startsWith('de')) return 'de'
  if (l.startsWith('es')) return 'es'
  if (l.startsWith('id') || l.startsWith('in')) return 'id' // 'in' = legacy id code
  return 'en'
}

type Dict = Record<string, string>

const en: Dict = {
  tagline: 'Everything stays on your computer.',
  language_label: 'Language',
  status_initializing: 'Starting…',
  status_qr: 'Waiting for you to link WhatsApp',
  status_authenticated: 'Linked — getting ready…',
  status_ready: 'Protecting you',
  status_disconnected: 'Disconnected — please re-link',
  status_auth_failure: 'Sign-in failed — please re-link',
  qr_instructions:
    'Open WhatsApp on your phone → Settings → Linked Devices → Link a Device, then scan this:',
  alerts_title: 'Alerts',
  alerts_empty: "No warnings yet. You're all clear.",
  alerts_dismiss: 'This was fine',
  alerts_unknown: 'Unknown sender',

  tab_home: 'Home',
  tab_settings: 'Settings',

  safelist_title: 'Trusted contacts',
  safelist_lead: 'Messages from these numbers are never checked. Add family and friends you trust.',
  safelist_placeholder: 'Country code + number, e.g. +44 7700 900123',
  safelist_add: 'Add',
  safelist_remove: 'Remove',
  safelist_empty: 'No trusted contacts yet.',
  safelist_more: '+{count} more',
  safelist_invalid: 'Please enter the country code and number, e.g. +44 7700 900123.',

  sysinfo_title: 'System info',
  sysinfo_model: 'Protection model',
  sysinfo_model_missing: 'Not downloaded',
  sysinfo_whatsapp: 'WhatsApp number',
  sysinfo_whatsapp_unlinked: 'Not linked yet',
  sysinfo_rules_updated: 'Scam rules updated',
  sysinfo_version: 'App version',
  sysinfo_logs: 'Logs folder',
  sysinfo_open: 'Open',
  model_health_ready: 'Active',
  model_health_starting: 'Starting…',
  model_health_stopped: 'Idle',
  model_health_cooldown: 'Paused after error',

  quit_title: 'Shut down',
  quit_lead: 'Stop checking messages and close WhatsGuard completely.',
  quit_button: 'Quit WhatsGuard',
  quit_confirm: 'Stop protection and quit WhatsGuard now?',

  disconnect_title: 'Disconnect & erase data',
  disconnect_lead:
    'Unlink your WhatsApp number and permanently erase all warnings, logs, trusted contacts, and settings from this computer.',
  disconnect_button: 'Disconnect & erase',
  disconnect_confirm:
    'This unlinks your WhatsApp number and permanently deletes all warnings, logs, trusted contacts, and settings on this computer. WhatsGuard will return to first-time setup. This cannot be undone. Continue?',

  model_title: 'Protection model',
  model_lead:
    'Choose how thorough the scam checks are. A bigger model is more accurate but needs a more powerful computer.',
  wiz_model_choose: 'Choose your protection model:',
  wiz_model_recommended: 'Recommended',
  wiz_model_spec: '{size} GB download · best with {ram} GB+ memory',
  model_blurb_e4b: 'Faster and lighter — great for most computers.',
  model_blurb_12b: 'Most accurate — needs a powerful computer.',
  model_switching: 'Setting up the model… the first switch can take a while.',
  model_ready: 'Model ready.',
  model_error: "Couldn't set up that model. Please check your internet connection and try again.",

  company_credit: 'Developed by AI Pedals',

  wiz_welcome_title: 'Welcome to WhatsGuard',
  wiz_welcome_lead:
    'WhatsGuard quietly checks the WhatsApp messages you receive on this computer and warns you if one looks like a scam.',
  wiz_welcome_p1: '🔒 Everything stays on your computer — nothing is sent over the internet.',
  wiz_welcome_p2: '👀 It only watches. It never replies or sends messages for you.',
  wiz_welcome_p3: "⚠️ It helps you spot scams, but it can't catch every one — always take your time.",
  wiz_welcome_cta: 'Get started',
  wiz_consent_title: 'Your permission',
  wiz_consent_lead:
    'To protect you, WhatsGuard needs to read the WhatsApp messages you receive on this computer and check them for scams.',
  wiz_consent_body:
    'Messages are read only on this device. WhatsGuard keeps a record of warnings, not your whole conversations.',
  wiz_consent_check: 'I understand and I agree.',
  wiz_consent_cta: 'Continue',
  wiz_setup_title: 'One-time download',
  wiz_setup_lead:
    'WhatsGuard needs a one-time download (about 6 GB) to recognise scams. On a slow connection this can take a while — you can leave it running.',
  wiz_setup_download: 'Download',
  wiz_setup_retry: 'Try again',
  wiz_setup_starting: 'Starting…',
  wiz_setup_skip: 'Skip for now',
  wiz_setup_error:
    "Download didn't finish. Please check your internet connection and try again.",
  wiz_link_title: 'Link your WhatsApp',
  wiz_link_lead:
    'On your phone, open WhatsApp → Settings → Linked Devices → Link a Device, then point your phone at this code:',
  wiz_link_preparing: 'Preparing the code…',
  wiz_link_waiting: 'Waiting for you to scan…',
  wiz_done_title: "✅ You're protected",
  wiz_done_lead:
    "WhatsGuard is now watching for scams in the background. If a message looks risky, you'll see a clear warning.",
  wiz_done_body: 'You can close this window — WhatsGuard keeps running in your menu bar.',
  wiz_done_finish: 'Finish',

  tray_tip_initializing: 'WhatsGuard — starting…',
  tray_tip_qr: 'WhatsGuard — waiting for you to link WhatsApp',
  tray_tip_authenticated: 'WhatsGuard — linking…',
  tray_tip_ready: 'WhatsGuard — protecting you',
  tray_tip_disconnected: 'WhatsGuard — DISCONNECTED, please re-link',
  tray_tip_auth_failure: 'WhatsGuard — sign-in failed, please re-link',
  tray_open: 'Open WhatsGuard',
  tray_logs: 'Open logs folder',
  tray_quit: 'Quit WhatsGuard',
  notif_title: 'WhatsGuard stopped protecting you',
  notif_body: 'WhatsApp was disconnected. Open WhatsGuard and re-scan the code to resume.'
}

const zh: Dict = {
  tagline: '一切都保存在您的电脑上。',
  language_label: '语言',
  status_initializing: '正在启动…',
  status_qr: '等待您连接 WhatsApp',
  status_authenticated: '已连接 — 正在准备…',
  status_ready: '正在保护您',
  status_disconnected: '已断开 — 请重新连接',
  status_auth_failure: '登录失败 — 请重新连接',
  qr_instructions: '在手机上打开 WhatsApp → 设置 → 已登录的设备 → 关联设备，然后扫描此二维码：',
  alerts_title: '警报',
  alerts_empty: '暂无警告。一切安全。',
  alerts_dismiss: '这是安全的',
  alerts_unknown: '未知发件人',

  tab_home: '主页',
  tab_settings: '设置',

  safelist_title: '信任的联系人',
  safelist_lead: '来自这些号码的消息不会被检查。请添加您信任的家人和朋友。',
  safelist_placeholder: '国家代码 + 号码，例如 +44 7700 900123',
  safelist_add: '添加',
  safelist_remove: '移除',
  safelist_empty: '尚无信任的联系人。',
  safelist_more: '还有 {count} 个',
  safelist_invalid: '请输入国家代码和号码，例如 +44 7700 900123。',

  sysinfo_title: '系统信息',
  sysinfo_model: '防护模型',
  sysinfo_model_missing: '尚未下载',
  sysinfo_whatsapp: 'WhatsApp 号码',
  sysinfo_whatsapp_unlinked: '尚未连接',
  sysinfo_rules_updated: '诈骗规则更新于',
  sysinfo_version: '应用版本',
  sysinfo_logs: '日志文件夹',
  sysinfo_open: '打开',
  model_health_ready: '运行中',
  model_health_starting: '正在启动…',
  model_health_stopped: '空闲',
  model_health_cooldown: '出错后已暂停',

  quit_title: '关闭',
  quit_lead: '停止检查消息并完全关闭 WhatsGuard。',
  quit_button: '退出 WhatsGuard',
  quit_confirm: '现在停止保护并退出 WhatsGuard 吗？',

  disconnect_title: '断开连接并清除数据',
  disconnect_lead: '解除您的 WhatsApp 号码连接，并永久清除这台电脑上的所有警告、日志、信任联系人和设置。',
  disconnect_button: '断开并清除',
  disconnect_confirm:
    '这将解除您的 WhatsApp 号码连接，并永久删除这台电脑上的所有警告、日志、信任联系人和设置。WhatsGuard 将恢复到初次设置状态。此操作无法撤销。是否继续？',

  model_title: '防护模型',
  model_lead: '选择诈骗检查的细致程度。更大的模型更准确，但需要性能更强的电脑。',
  wiz_model_choose: '请选择您的防护模型：',
  wiz_model_recommended: '推荐',
  wiz_model_spec: '下载 {size} GB · 建议 {ram} GB 以上内存',
  model_blurb_e4b: '更快更轻 — 适合大多数电脑。',
  model_blurb_12b: '最准确 — 需要性能较强的电脑。',
  model_switching: '正在设置模型……首次切换可能需要一些时间。',
  model_ready: '模型已就绪。',
  model_error: '无法设置该模型。请检查您的网络连接后重试。',

  company_credit: '由 AI Pedals 开发',

  wiz_welcome_title: '欢迎使用 WhatsGuard',
  wiz_welcome_lead:
    'WhatsGuard 会在这台电脑上悄悄检查您收到的 WhatsApp 消息，如果发现可能是诈骗就会提醒您。',
  wiz_welcome_p1: '🔒 一切都保存在您的电脑上 — 不会发送到互联网。',
  wiz_welcome_p2: '👀 它只会查看，绝不会替您回复或发送消息。',
  wiz_welcome_p3: '⚠️ 它能帮您识别诈骗，但无法发现每一个 — 请始终保持谨慎。',
  wiz_welcome_cta: '开始',
  wiz_consent_title: '您的授权',
  wiz_consent_lead:
    '为了保护您，WhatsGuard 需要读取您在这台电脑上收到的 WhatsApp 消息并检查是否为诈骗。',
  wiz_consent_body: '消息只在本设备上读取。WhatsGuard 只保存警告记录，不会保存您的全部聊天内容。',
  wiz_consent_check: '我已理解并同意。',
  wiz_consent_cta: '继续',
  wiz_setup_title: '一次性下载',
  wiz_setup_lead:
    'WhatsGuard 需要一次性下载（约 6 GB）来识别诈骗。网络较慢时可能需要一些时间 — 您可以让它继续运行。',
  wiz_setup_download: '下载',
  wiz_setup_retry: '重试',
  wiz_setup_starting: '正在开始…',
  wiz_setup_skip: '暂时跳过',
  wiz_setup_error: '下载未完成。请检查您的网络连接后重试。',
  wiz_link_title: '连接您的 WhatsApp',
  wiz_link_lead: '在手机上打开 WhatsApp → 设置 → 已登录的设备 → 关联设备，然后用手机对准此二维码：',
  wiz_link_preparing: '正在准备二维码…',
  wiz_link_waiting: '等待您扫描…',
  wiz_done_title: '✅ 您已受到保护',
  wiz_done_lead: 'WhatsGuard 正在后台监测诈骗。如果某条消息有风险，您会看到清晰的警告。',
  wiz_done_body: '您可以关闭此窗口 — WhatsGuard 会在菜单栏中继续运行。',
  wiz_done_finish: '完成',

  tray_tip_initializing: 'WhatsGuard — 正在启动…',
  tray_tip_qr: 'WhatsGuard — 等待您连接 WhatsApp',
  tray_tip_authenticated: 'WhatsGuard — 正在连接…',
  tray_tip_ready: 'WhatsGuard — 正在保护您',
  tray_tip_disconnected: 'WhatsGuard — 已断开，请重新连接',
  tray_tip_auth_failure: 'WhatsGuard — 登录失败，请重新连接',
  tray_open: '打开 WhatsGuard',
  tray_logs: '打开日志文件夹',
  tray_quit: '退出 WhatsGuard',
  notif_title: 'WhatsGuard 已停止保护',
  notif_body: 'WhatsApp 已断开连接。请打开 WhatsGuard 并重新扫描二维码以恢复。'
}

const id: Dict = {
  tagline: 'Semuanya tetap di komputer Anda.',
  language_label: 'Bahasa',
  status_initializing: 'Memulai…',
  status_qr: 'Menunggu Anda menautkan WhatsApp',
  status_authenticated: 'Tertaut — sedang menyiapkan…',
  status_ready: 'Melindungi Anda',
  status_disconnected: 'Terputus — silakan tautkan ulang',
  status_auth_failure: 'Gagal masuk — silakan tautkan ulang',
  qr_instructions:
    'Buka WhatsApp di ponsel Anda → Setelan → Perangkat Tertaut → Tautkan Perangkat, lalu pindai ini:',
  alerts_title: 'Peringatan',
  alerts_empty: 'Belum ada peringatan. Anda aman.',
  alerts_dismiss: 'Ini aman',
  alerts_unknown: 'Pengirim tidak dikenal',

  tab_home: 'Beranda',
  tab_settings: 'Pengaturan',

  safelist_title: 'Kontak tepercaya',
  safelist_lead: 'Pesan dari nomor ini tidak pernah diperiksa. Tambahkan keluarga dan teman yang Anda percaya.',
  safelist_placeholder: 'Kode negara + nomor, mis. +44 7700 900123',
  safelist_add: 'Tambah',
  safelist_remove: 'Hapus',
  safelist_empty: 'Belum ada kontak tepercaya.',
  safelist_more: '+{count} lainnya',
  safelist_invalid: 'Masukkan kode negara dan nomor, mis. +44 7700 900123.',

  sysinfo_title: 'Info sistem',
  sysinfo_model: 'Model perlindungan',
  sysinfo_model_missing: 'Belum diunduh',
  sysinfo_whatsapp: 'Nomor WhatsApp',
  sysinfo_whatsapp_unlinked: 'Belum tertaut',
  sysinfo_rules_updated: 'Aturan penipuan diperbarui',
  sysinfo_version: 'Versi aplikasi',
  sysinfo_logs: 'Folder log',
  sysinfo_open: 'Buka',
  model_health_ready: 'Aktif',
  model_health_starting: 'Memulai…',
  model_health_stopped: 'Siaga',
  model_health_cooldown: 'Dijeda setelah kesalahan',

  quit_title: 'Matikan',
  quit_lead: 'Berhenti memeriksa pesan dan tutup WhatsGuard sepenuhnya.',
  quit_button: 'Keluar dari WhatsGuard',
  quit_confirm: 'Hentikan perlindungan dan keluar dari WhatsGuard sekarang?',

  disconnect_title: 'Putuskan & hapus data',
  disconnect_lead:
    'Lepas tautan nomor WhatsApp Anda dan hapus permanen semua peringatan, log, kontak tepercaya, dan setelan dari komputer ini.',
  disconnect_button: 'Putuskan & hapus',
  disconnect_confirm:
    'Ini melepas tautan nomor WhatsApp Anda dan menghapus permanen semua peringatan, log, kontak tepercaya, dan setelan di komputer ini. WhatsGuard akan kembali ke penyiapan awal. Tindakan ini tidak dapat dibatalkan. Lanjutkan?',

  model_title: 'Model perlindungan',
  model_lead:
    'Pilih seberapa teliti pemeriksaan penipuan. Model yang lebih besar lebih akurat tetapi memerlukan komputer yang lebih bertenaga.',
  wiz_model_choose: 'Pilih model perlindungan Anda:',
  wiz_model_recommended: 'Disarankan',
  wiz_model_spec: 'Unduh {size} GB · terbaik dengan memori {ram} GB+',
  model_blurb_e4b: 'Lebih cepat dan ringan — cocok untuk sebagian besar komputer.',
  model_blurb_12b: 'Paling akurat — memerlukan komputer yang bertenaga.',
  model_switching: 'Menyiapkan model… peralihan pertama bisa memakan waktu.',
  model_ready: 'Model siap.',
  model_error: 'Tidak dapat menyiapkan model itu. Periksa koneksi internet Anda dan coba lagi.',

  company_credit: 'Dikembangkan oleh AI Pedals',

  wiz_welcome_title: 'Selamat datang di WhatsGuard',
  wiz_welcome_lead:
    'WhatsGuard diam-diam memeriksa pesan WhatsApp yang Anda terima di komputer ini dan memperingatkan jika ada yang tampak seperti penipuan.',
  wiz_welcome_p1: '🔒 Semuanya tetap di komputer Anda — tidak ada yang dikirim ke internet.',
  wiz_welcome_p2: '👀 Hanya mengawasi. Tidak pernah membalas atau mengirim pesan untuk Anda.',
  wiz_welcome_p3:
    '⚠️ Membantu Anda mengenali penipuan, tetapi tidak bisa menangkap semuanya — selalu berhati-hatilah.',
  wiz_welcome_cta: 'Mulai',
  wiz_consent_title: 'Izin Anda',
  wiz_consent_lead:
    'Untuk melindungi Anda, WhatsGuard perlu membaca pesan WhatsApp yang Anda terima di komputer ini dan memeriksanya dari penipuan.',
  wiz_consent_body:
    'Pesan hanya dibaca di perangkat ini. WhatsGuard menyimpan catatan peringatan, bukan seluruh percakapan Anda.',
  wiz_consent_check: 'Saya mengerti dan setuju.',
  wiz_consent_cta: 'Lanjutkan',
  wiz_setup_title: 'Unduhan sekali saja',
  wiz_setup_lead:
    'WhatsGuard perlu mengunduh sekali (sekitar 6 GB) untuk mengenali penipuan. Pada koneksi lambat ini bisa memakan waktu — Anda boleh membiarkannya berjalan.',
  wiz_setup_download: 'Unduh',
  wiz_setup_retry: 'Coba lagi',
  wiz_setup_starting: 'Memulai…',
  wiz_setup_skip: 'Lewati dulu',
  wiz_setup_error: 'Unduhan tidak selesai. Periksa koneksi internet Anda dan coba lagi.',
  wiz_link_title: 'Tautkan WhatsApp Anda',
  wiz_link_lead:
    'Di ponsel Anda, buka WhatsApp → Setelan → Perangkat Tertaut → Tautkan Perangkat, lalu arahkan ponsel ke kode ini:',
  wiz_link_preparing: 'Menyiapkan kode…',
  wiz_link_waiting: 'Menunggu Anda memindai…',
  wiz_done_title: '✅ Anda terlindungi',
  wiz_done_lead:
    'WhatsGuard kini mengawasi penipuan di latar belakang. Jika sebuah pesan berisiko, Anda akan melihat peringatan yang jelas.',
  wiz_done_body: 'Anda boleh menutup jendela ini — WhatsGuard tetap berjalan di bilah menu.',
  wiz_done_finish: 'Selesai',

  tray_tip_initializing: 'WhatsGuard — memulai…',
  tray_tip_qr: 'WhatsGuard — menunggu Anda menautkan WhatsApp',
  tray_tip_authenticated: 'WhatsGuard — menautkan…',
  tray_tip_ready: 'WhatsGuard — melindungi Anda',
  tray_tip_disconnected: 'WhatsGuard — TERPUTUS, silakan tautkan ulang',
  tray_tip_auth_failure: 'WhatsGuard — gagal masuk, silakan tautkan ulang',
  tray_open: 'Buka WhatsGuard',
  tray_logs: 'Buka folder log',
  tray_quit: 'Keluar dari WhatsGuard',
  notif_title: 'WhatsGuard berhenti melindungi Anda',
  notif_body: 'WhatsApp terputus. Buka WhatsGuard dan pindai ulang kode untuk melanjutkan.'
}

const zhHant: Dict = {
  tagline: '一切都保留在您的電腦上。',
  language_label: '語言',
  status_initializing: '正在啟動…',
  status_qr: '等待您連結 WhatsApp',
  status_authenticated: '已連結 — 正在準備…',
  status_ready: '正在保護您',
  status_disconnected: '已中斷連線 — 請重新連結',
  status_auth_failure: '登入失敗 — 請重新連結',
  qr_instructions: '在手機上開啟 WhatsApp → 設定 → 已連結的裝置 → 連結裝置，然後掃描此 QR 碼：',
  alerts_title: '警示',
  alerts_empty: '目前沒有警告。一切安全。',
  alerts_dismiss: '這沒問題',
  alerts_unknown: '未知寄件者',

  tab_home: '首頁',
  tab_settings: '設定',

  safelist_title: '信任的聯絡人',
  safelist_lead: '來自這些號碼的訊息不會被檢查。請新增您信任的家人和朋友。',
  safelist_placeholder: '國碼 + 號碼，例如 +44 7700 900123',
  safelist_add: '新增',
  safelist_remove: '移除',
  safelist_empty: '尚無信任的聯絡人。',
  safelist_more: '還有 {count} 個',
  safelist_invalid: '請輸入國碼和號碼，例如 +44 7700 900123。',

  sysinfo_title: '系統資訊',
  sysinfo_model: '防護模型',
  sysinfo_model_missing: '尚未下載',
  sysinfo_whatsapp: 'WhatsApp 號碼',
  sysinfo_whatsapp_unlinked: '尚未連結',
  sysinfo_rules_updated: '詐騙規則更新於',
  sysinfo_version: '應用程式版本',
  sysinfo_logs: '記錄檔資料夾',
  sysinfo_open: '開啟',
  model_health_ready: '執行中',
  model_health_starting: '正在啟動…',
  model_health_stopped: '閒置',
  model_health_cooldown: '發生錯誤後已暫停',

  quit_title: '關閉',
  quit_lead: '停止檢查訊息並完全關閉 WhatsGuard。',
  quit_button: '結束 WhatsGuard',
  quit_confirm: '現在停止保護並結束 WhatsGuard 嗎？',

  disconnect_title: '中斷連線並清除資料',
  disconnect_lead: '解除您的 WhatsApp 號碼連結，並永久清除這台電腦上的所有警告、記錄、信任聯絡人和設定。',
  disconnect_button: '中斷並清除',
  disconnect_confirm:
    '這將解除您的 WhatsApp 號碼連結，並永久刪除這台電腦上的所有警告、記錄、信任聯絡人和設定。WhatsGuard 將回到初次設定狀態。此操作無法復原。是否繼續？',

  model_title: '防護模型',
  model_lead: '選擇詐騙檢查的仔細程度。較大的模型更準確，但需要效能較強的電腦。',
  wiz_model_choose: '請選擇您的防護模型：',
  wiz_model_recommended: '建議',
  wiz_model_spec: '下載 {size} GB · 建議 {ram} GB 以上記憶體',
  model_blurb_e4b: '更快更輕巧 — 適合大多數電腦。',
  model_blurb_12b: '最準確 — 需要效能強大的電腦。',
  model_switching: '正在設定模型……首次切換可能需要一些時間。',
  model_ready: '模型已就緒。',
  model_error: '無法設定該模型。請檢查您的網路連線後重試。',

  company_credit: '由 AI Pedals 開發',

  wiz_welcome_title: '歡迎使用 WhatsGuard',
  wiz_welcome_lead:
    'WhatsGuard 會在這台電腦上悄悄檢查您收到的 WhatsApp 訊息，如果發現可能是詐騙就會提醒您。',
  wiz_welcome_p1: '🔒 一切都保留在您的電腦上 — 不會傳送到網際網路。',
  wiz_welcome_p2: '👀 它只會查看，絕不會替您回覆或傳送訊息。',
  wiz_welcome_p3: '⚠️ 它能幫您識別詐騙，但無法發現每一個 — 請始終保持謹慎。',
  wiz_welcome_cta: '開始',
  wiz_consent_title: '您的授權',
  wiz_consent_lead:
    '為了保護您，WhatsGuard 需要讀取您在這台電腦上收到的 WhatsApp 訊息並檢查是否為詐騙。',
  wiz_consent_body: '訊息只在本裝置上讀取。WhatsGuard 只保存警告記錄，不會保存您的全部聊天內容。',
  wiz_consent_check: '我已理解並同意。',
  wiz_consent_cta: '繼續',
  wiz_setup_title: '一次性下載',
  wiz_setup_lead:
    'WhatsGuard 需要一次性下載（約 6 GB）來識別詐騙。網路較慢時可能需要一些時間 — 您可以讓它繼續執行。',
  wiz_setup_download: '下載',
  wiz_setup_retry: '重試',
  wiz_setup_starting: '正在開始…',
  wiz_setup_skip: '暫時略過',
  wiz_setup_error: '下載未完成。請檢查您的網路連線後重試。',
  wiz_link_title: '連結您的 WhatsApp',
  wiz_link_lead: '在手機上開啟 WhatsApp → 設定 → 已連結的裝置 → 連結裝置，然後用手機對準此 QR 碼：',
  wiz_link_preparing: '正在準備 QR 碼…',
  wiz_link_waiting: '等待您掃描…',
  wiz_done_title: '✅ 您已受到保護',
  wiz_done_lead: 'WhatsGuard 正在背景監測詐騙。如果某則訊息有風險，您會看到清楚的警告。',
  wiz_done_body: '您可以關閉此視窗 — WhatsGuard 會在選單列中繼續執行。',
  wiz_done_finish: '完成',

  tray_tip_initializing: 'WhatsGuard — 正在啟動…',
  tray_tip_qr: 'WhatsGuard — 等待您連結 WhatsApp',
  tray_tip_authenticated: 'WhatsGuard — 正在連結…',
  tray_tip_ready: 'WhatsGuard — 正在保護您',
  tray_tip_disconnected: 'WhatsGuard — 已中斷連線，請重新連結',
  tray_tip_auth_failure: 'WhatsGuard — 登入失敗，請重新連結',
  tray_open: '開啟 WhatsGuard',
  tray_logs: '開啟記錄檔資料夾',
  tray_quit: '結束 WhatsGuard',
  notif_title: 'WhatsGuard 已停止保護',
  notif_body: 'WhatsApp 已中斷連線。請開啟 WhatsGuard 並重新掃描 QR 碼以恢復。'
}

const de: Dict = {
  tagline: 'Alles bleibt auf Ihrem Computer.',
  language_label: 'Sprache',
  status_initializing: 'Wird gestartet…',
  status_qr: 'Warte darauf, dass Sie WhatsApp verknüpfen',
  status_authenticated: 'Verknüpft – wird vorbereitet…',
  status_ready: 'Sie sind geschützt',
  status_disconnected: 'Getrennt – bitte erneut verknüpfen',
  status_auth_failure: 'Anmeldung fehlgeschlagen – bitte erneut verknüpfen',
  qr_instructions:
    'Öffnen Sie WhatsApp auf Ihrem Handy → Einstellungen → Verknüpfte Geräte → Gerät verknüpfen, und scannen Sie dann dies:',
  alerts_title: 'Warnungen',
  alerts_empty: 'Noch keine Warnungen. Alles in Ordnung.',
  alerts_dismiss: 'War in Ordnung',
  alerts_unknown: 'Unbekannter Absender',

  tab_home: 'Start',
  tab_settings: 'Einstellungen',

  safelist_title: 'Vertrauenswürdige Kontakte',
  safelist_lead:
    'Nachrichten von diesen Nummern werden nie geprüft. Fügen Sie Familie und Freunde hinzu, denen Sie vertrauen.',
  safelist_placeholder: 'Ländervorwahl + Nummer, z. B. +44 7700 900123',
  safelist_add: 'Hinzufügen',
  safelist_remove: 'Entfernen',
  safelist_empty: 'Noch keine vertrauenswürdigen Kontakte.',
  safelist_more: '+{count} weitere',
  safelist_invalid: 'Bitte geben Sie Ländervorwahl und Nummer ein, z. B. +44 7700 900123.',

  sysinfo_title: 'Systeminfo',
  sysinfo_model: 'Schutzmodell',
  sysinfo_model_missing: 'Nicht heruntergeladen',
  sysinfo_whatsapp: 'WhatsApp-Nummer',
  sysinfo_whatsapp_unlinked: 'Noch nicht verknüpft',
  sysinfo_rules_updated: 'Betrugsregeln aktualisiert',
  sysinfo_version: 'App-Version',
  sysinfo_logs: 'Protokollordner',
  sysinfo_open: 'Öffnen',
  model_health_ready: 'Aktiv',
  model_health_starting: 'Wird gestartet…',
  model_health_stopped: 'Inaktiv',
  model_health_cooldown: 'Nach Fehler pausiert',

  quit_title: 'Beenden',
  quit_lead: 'Nachrichtenprüfung stoppen und WhatsGuard vollständig schließen.',
  quit_button: 'WhatsGuard beenden',
  quit_confirm: 'Schutz stoppen und WhatsGuard jetzt beenden?',

  disconnect_title: 'Trennen & Daten löschen',
  disconnect_lead:
    'Trennen Sie Ihre WhatsApp-Nummer und löschen Sie alle Warnungen, Protokolle, vertrauenswürdigen Kontakte und Einstellungen dauerhaft von diesem Computer.',
  disconnect_button: 'Trennen & löschen',
  disconnect_confirm:
    'Dadurch wird Ihre WhatsApp-Nummer getrennt und alle Warnungen, Protokolle, vertrauenswürdigen Kontakte und Einstellungen auf diesem Computer werden dauerhaft gelöscht. WhatsGuard kehrt zur Ersteinrichtung zurück. Dies kann nicht rückgängig gemacht werden. Fortfahren?',

  model_title: 'Schutzmodell',
  model_lead:
    'Wählen Sie, wie gründlich die Betrugsprüfung ist. Ein größeres Modell ist genauer, benötigt aber einen leistungsstärkeren Computer.',
  wiz_model_choose: 'Wählen Sie Ihr Schutzmodell:',
  wiz_model_recommended: 'Empfohlen',
  wiz_model_spec: '{size} GB Download · am besten mit {ram} GB+ Arbeitsspeicher',
  model_blurb_e4b: 'Schneller und schlanker – ideal für die meisten Computer.',
  model_blurb_12b: 'Am genauesten – benötigt einen leistungsstarken Computer.',
  model_switching: 'Modell wird eingerichtet… der erste Wechsel kann eine Weile dauern.',
  model_ready: 'Modell bereit.',
  model_error:
    'Modell konnte nicht eingerichtet werden. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.',

  company_credit: 'Entwickelt von AI Pedals',

  wiz_welcome_title: 'Willkommen bei WhatsGuard',
  wiz_welcome_lead:
    'WhatsGuard prüft im Hintergrund die WhatsApp-Nachrichten, die Sie auf diesem Computer erhalten, und warnt Sie, wenn eine wie ein Betrug aussieht.',
  wiz_welcome_p1: '🔒 Alles bleibt auf Ihrem Computer – nichts wird über das Internet gesendet.',
  wiz_welcome_p2: '👀 Es schaut nur zu. Es antwortet nie und sendet keine Nachrichten für Sie.',
  wiz_welcome_p3:
    '⚠️ Es hilft Ihnen, Betrug zu erkennen, kann aber nicht jeden erkennen – nehmen Sie sich immer Zeit.',
  wiz_welcome_cta: 'Loslegen',
  wiz_consent_title: 'Ihre Erlaubnis',
  wiz_consent_lead:
    'Um Sie zu schützen, muss WhatsGuard die WhatsApp-Nachrichten lesen, die Sie auf diesem Computer erhalten, und sie auf Betrug prüfen.',
  wiz_consent_body:
    'Nachrichten werden nur auf diesem Gerät gelesen. WhatsGuard speichert eine Aufzeichnung der Warnungen, nicht Ihre gesamten Unterhaltungen.',
  wiz_consent_check: 'Ich verstehe und stimme zu.',
  wiz_consent_cta: 'Weiter',
  wiz_setup_title: 'Einmaliger Download',
  wiz_setup_lead:
    'WhatsGuard benötigt einen einmaligen Download (etwa 6 GB), um Betrug zu erkennen. Bei langsamer Verbindung kann dies eine Weile dauern – Sie können es laufen lassen.',
  wiz_setup_download: 'Herunterladen',
  wiz_setup_retry: 'Erneut versuchen',
  wiz_setup_starting: 'Wird gestartet…',
  wiz_setup_skip: 'Vorerst überspringen',
  wiz_setup_error:
    'Download nicht abgeschlossen. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.',
  wiz_link_title: 'WhatsApp verknüpfen',
  wiz_link_lead:
    'Öffnen Sie auf Ihrem Handy WhatsApp → Einstellungen → Verknüpfte Geräte → Gerät verknüpfen, und richten Sie Ihr Handy dann auf diesen Code:',
  wiz_link_preparing: 'Code wird vorbereitet…',
  wiz_link_waiting: 'Warte auf Ihren Scan…',
  wiz_done_title: '✅ Sie sind geschützt',
  wiz_done_lead:
    'WhatsGuard achtet jetzt im Hintergrund auf Betrug. Wenn eine Nachricht riskant aussieht, sehen Sie eine klare Warnung.',
  wiz_done_body: 'Sie können dieses Fenster schließen – WhatsGuard läuft in Ihrer Menüleiste weiter.',
  wiz_done_finish: 'Fertig',

  tray_tip_initializing: 'WhatsGuard – wird gestartet…',
  tray_tip_qr: 'WhatsGuard – warte auf die WhatsApp-Verknüpfung',
  tray_tip_authenticated: 'WhatsGuard – wird verknüpft…',
  tray_tip_ready: 'WhatsGuard – Sie sind geschützt',
  tray_tip_disconnected: 'WhatsGuard – GETRENNT, bitte erneut verknüpfen',
  tray_tip_auth_failure: 'WhatsGuard – Anmeldung fehlgeschlagen, bitte erneut verknüpfen',
  tray_open: 'WhatsGuard öffnen',
  tray_logs: 'Protokollordner öffnen',
  tray_quit: 'WhatsGuard beenden',
  notif_title: 'WhatsGuard schützt Sie nicht mehr',
  notif_body:
    'WhatsApp wurde getrennt. Öffnen Sie WhatsGuard und scannen Sie den Code erneut, um fortzufahren.'
}

const es: Dict = {
  tagline: 'Todo se queda en su computadora.',
  language_label: 'Idioma',
  status_initializing: 'Iniciando…',
  status_qr: 'Esperando a que vincule WhatsApp',
  status_authenticated: 'Vinculado: preparando…',
  status_ready: 'Protegiéndole',
  status_disconnected: 'Desconectado: vuelva a vincular',
  status_auth_failure: 'Error al iniciar sesión: vuelva a vincular',
  qr_instructions:
    'Abra WhatsApp en su teléfono → Ajustes → Dispositivos vinculados → Vincular un dispositivo, y luego escanee esto:',
  alerts_title: 'Alertas',
  alerts_empty: 'Aún no hay advertencias. Todo en orden.',
  alerts_dismiss: 'Esto estaba bien',
  alerts_unknown: 'Remitente desconocido',

  tab_home: 'Inicio',
  tab_settings: 'Ajustes',

  safelist_title: 'Contactos de confianza',
  safelist_lead:
    'Los mensajes de estos números nunca se revisan. Agregue a familiares y amigos en quienes confía.',
  safelist_placeholder: 'Código de país + número, p. ej. +44 7700 900123',
  safelist_add: 'Agregar',
  safelist_remove: 'Quitar',
  safelist_empty: 'Aún no hay contactos de confianza.',
  safelist_more: '+{count} más',
  safelist_invalid: 'Ingrese el código de país y el número, p. ej. +44 7700 900123.',

  sysinfo_title: 'Información del sistema',
  sysinfo_model: 'Modelo de protección',
  sysinfo_model_missing: 'No descargado',
  sysinfo_whatsapp: 'Número de WhatsApp',
  sysinfo_whatsapp_unlinked: 'Aún no vinculado',
  sysinfo_rules_updated: 'Reglas de estafa actualizadas',
  sysinfo_version: 'Versión de la app',
  sysinfo_logs: 'Carpeta de registros',
  sysinfo_open: 'Abrir',
  model_health_ready: 'Activo',
  model_health_starting: 'Iniciando…',
  model_health_stopped: 'Inactivo',
  model_health_cooldown: 'En pausa tras un error',

  quit_title: 'Apagar',
  quit_lead: 'Dejar de revisar mensajes y cerrar WhatsGuard por completo.',
  quit_button: 'Salir de WhatsGuard',
  quit_confirm: '¿Detener la protección y salir de WhatsGuard ahora?',

  disconnect_title: 'Desconectar y borrar datos',
  disconnect_lead:
    'Desvincule su número de WhatsApp y borre de forma permanente todas las advertencias, registros, contactos de confianza y ajustes de esta computadora.',
  disconnect_button: 'Desconectar y borrar',
  disconnect_confirm:
    'Esto desvincula su número de WhatsApp y elimina de forma permanente todas las advertencias, registros, contactos de confianza y ajustes de esta computadora. WhatsGuard volverá a la configuración inicial. Esto no se puede deshacer. ¿Continuar?',

  model_title: 'Modelo de protección',
  model_lead:
    'Elija qué tan exhaustivas son las comprobaciones de estafa. Un modelo más grande es más preciso pero necesita una computadora más potente.',
  wiz_model_choose: 'Elija su modelo de protección:',
  wiz_model_recommended: 'Recomendado',
  wiz_model_spec: 'Descarga de {size} GB · mejor con {ram} GB+ de memoria',
  model_blurb_e4b: 'Más rápido y ligero: ideal para la mayoría de las computadoras.',
  model_blurb_12b: 'El más preciso: necesita una computadora potente.',
  model_switching: 'Configurando el modelo… el primer cambio puede tardar un poco.',
  model_ready: 'Modelo listo.',
  model_error:
    'No se pudo configurar ese modelo. Compruebe su conexión a internet e inténtelo de nuevo.',

  company_credit: 'Desarrollado por AI Pedals',

  wiz_welcome_title: 'Bienvenido a WhatsGuard',
  wiz_welcome_lead:
    'WhatsGuard revisa discretamente los mensajes de WhatsApp que recibe en esta computadora y le advierte si alguno parece una estafa.',
  wiz_welcome_p1: '🔒 Todo se queda en su computadora: nada se envía por internet.',
  wiz_welcome_p2: '👀 Solo observa. Nunca responde ni envía mensajes por usted.',
  wiz_welcome_p3:
    '⚠️ Le ayuda a detectar estafas, pero no puede detectarlas todas: tómese siempre su tiempo.',
  wiz_welcome_cta: 'Comenzar',
  wiz_consent_title: 'Su permiso',
  wiz_consent_lead:
    'Para protegerle, WhatsGuard necesita leer los mensajes de WhatsApp que recibe en esta computadora y comprobar si son estafas.',
  wiz_consent_body:
    'Los mensajes se leen solo en este dispositivo. WhatsGuard guarda un registro de las advertencias, no todas sus conversaciones.',
  wiz_consent_check: 'Entiendo y acepto.',
  wiz_consent_cta: 'Continuar',
  wiz_setup_title: 'Descarga única',
  wiz_setup_lead:
    'WhatsGuard necesita una descarga única (unos 6 GB) para reconocer estafas. Con una conexión lenta puede tardar un rato: puede dejarla en marcha.',
  wiz_setup_download: 'Descargar',
  wiz_setup_retry: 'Reintentar',
  wiz_setup_starting: 'Iniciando…',
  wiz_setup_skip: 'Omitir por ahora',
  wiz_setup_error:
    'La descarga no se completó. Compruebe su conexión a internet e inténtelo de nuevo.',
  wiz_link_title: 'Vincule su WhatsApp',
  wiz_link_lead:
    'En su teléfono, abra WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo, y luego apunte su teléfono a este código:',
  wiz_link_preparing: 'Preparando el código…',
  wiz_link_waiting: 'Esperando a que escanee…',
  wiz_done_title: '✅ Está protegido',
  wiz_done_lead:
    'WhatsGuard ahora vigila las estafas en segundo plano. Si un mensaje parece riesgoso, verá una advertencia clara.',
  wiz_done_body: 'Puede cerrar esta ventana: WhatsGuard sigue funcionando en su barra de menú.',
  wiz_done_finish: 'Finalizar',

  tray_tip_initializing: 'WhatsGuard: iniciando…',
  tray_tip_qr: 'WhatsGuard: esperando a que vincule WhatsApp',
  tray_tip_authenticated: 'WhatsGuard: vinculando…',
  tray_tip_ready: 'WhatsGuard: protegiéndole',
  tray_tip_disconnected: 'WhatsGuard: DESCONECTADO, vuelva a vincular',
  tray_tip_auth_failure: 'WhatsGuard: error al iniciar sesión, vuelva a vincular',
  tray_open: 'Abrir WhatsGuard',
  tray_logs: 'Abrir carpeta de registros',
  tray_quit: 'Salir de WhatsGuard',
  notif_title: 'WhatsGuard dejó de protegerle',
  notif_body: 'WhatsApp se desconectó. Abra WhatsGuard y vuelva a escanear el código para reanudar.'
}

const DICTS: Record<Lang, Dict> = { en, zh, 'zh-Hant': zhHant, id, de, es }

/** Translate a key; falls back to English, then the key itself. {param} interpolation. */
export function t(lang: Lang, key: string, params?: Record<string, string | number>): string {
  let s = DICTS[lang]?.[key] ?? en[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v))
  }
  return s
}
