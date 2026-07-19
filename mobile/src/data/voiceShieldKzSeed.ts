// Derived from ml/seeds/voiceshield_seed_kz.json.
// Keep this artifact limited to derived SMS metadata; it is not a live-call decision model.
export const voiceShieldKzSeed = {
  schemaVersion: 'voiceshield.grammar.seed.v1',
  version: '1.0.0',
  languages: ['ru', 'kz'],
  officialSenders: [
    'Kaspi', 'Halyk', 'BCC', 'ForteBank', 'Jusan', 'Beeline', 'Kcell', 'Tele2', 'eGov',
  ],
  rules: [
    { id: 'bank_safe_account', subtype: 'safe_account', risk: 'critical', phrase: 'безопасный счет' },
    { id: 'bank_fake_employee', subtype: 'fake_security', risk: 'critical', phrase: 'служба безопасности банка' },
    { id: 'bank_urgent_transfer', subtype: 'urgent_transfer', risk: 'critical', phrase: 'срочно переведите деньги' },
    { id: 'police_relative', subtype: 'fake_police', risk: 'critical', phrase: 'вас подозревают' },
    { id: 'egov_phishing', subtype: 'egov_phishing', risk: 'high', phrase: 'egov ссылка код' },
    { id: 'investment', subtype: 'investment_scam', risk: 'high', phrase: 'гарантированный доход' },
    { id: 'smishing', subtype: 'remote_access', risk: 'high', phrase: 'установите приложение для доступа' },
    { id: 'otp_request', subtype: 'otp_request', risk: 'medium', phrase: 'назовите код' },
    { id: 'safe_otp', subtype: 'safe_otp', risk: 'none', phrase: 'никому не сообщайте код' },
    { id: 'safe_transaction', subtype: 'safe_notification', risk: 'none', phrase: 'списание баланс' },
  ],
} as const

export type VoiceShieldSeedRule = (typeof voiceShieldKzSeed.rules)[number]
