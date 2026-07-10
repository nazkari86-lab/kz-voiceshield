package kz.voiceshield

object AppContextClassifier {
  fun classify(packageName: String?): String? {
    val value = packageName?.lowercase().orEmpty()
    if (value.isBlank()) return null
    if (listOf("anydesk", "teamviewer", "rustdesk", "airdroid", "supremo").any(value::contains)) return "remote_access_app_open"
    if (listOf("zoom", "meet", "teams").any(value::contains)) return "screen_share_app_open"
    if (listOf("kaspi", "homebank", "halyk", "forte", "bereke", "jusan", "centercredit", ".bcc", "bank").any(value::contains)) return "bank_app_open"
    return null
  }
}
