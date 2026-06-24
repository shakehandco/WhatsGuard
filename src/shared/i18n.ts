/**
 * Tiny i18n layer shared by main (tray/notifications) and renderer (wizard +
 * dashboard). Plus the LLM is instructed to write its plain-language scam reason
 * in the selected language (see LANGUAGE_NAMES + the classifier).
 */

export type Lang = 'en' | 'zh' | 'id'

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'id', label: 'Bahasa Indonesia' }
]

/** Human name used in the LLM prompt to set the output language. */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: 'English',
  zh: 'Simplified Chinese',
  id: 'Bahasa Indonesia'
}

/** BCP-47 locale for Intl date formatting per language. */
export const LANG_LOCALE: Record<Lang, string> = {
  en: 'en-GB',
  zh: 'zh-CN',
  id: 'id-ID'
}

/** Map an OS locale string (app.getLocale / navigator.language) to a Lang. */
export function normalizeLang(locale: string | undefined): Lang {
  const l = (locale ?? '').toLowerCase()
  if (l.startsWith('zh')) return 'zh'
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

const DICTS: Record<Lang, Dict> = { en, zh, id }

/** Translate a key; falls back to English, then the key itself. {param} interpolation. */
export function t(lang: Lang, key: string, params?: Record<string, string | number>): string {
  let s = DICTS[lang]?.[key] ?? en[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v))
  }
  return s
}
