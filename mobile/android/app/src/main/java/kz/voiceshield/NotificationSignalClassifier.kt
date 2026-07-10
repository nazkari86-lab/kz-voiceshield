package kz.voiceshield

object NotificationSignalClassifier {
  fun classify(text: String): String? {
    val normalized = text.lowercase()
    if (listOf("otp", "одноразовый код", "код подтверждения", "смс-код", "sms code", "растау коды", "бір реттік код").any(normalized::contains)) {
      return "otp_notification"
    }
    if (listOf("перевод", "списание", "платеж", "кредит", "аударым", "төлем", "несие").any(normalized::contains)) {
      return "bank_activity_notification"
    }
    return null
  }
}
