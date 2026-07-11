package kz.voiceshield

data class PhoneRiskInput(
  val verificationStatus: String,
  val trusted: Boolean = false,
  val blocked: Boolean = false,
  val hidden: Boolean = false,
  val international: Boolean = false,
  val complaintCount: Int = 0,
  val recentCallCount: Int = 1,
  val distinctRecentCallers: Int = 1,
  val quietHours: Boolean = false,
  val blockHidden: Boolean = false,
  val blockInternational: Boolean = false,
  val blockRepeated: Boolean = true,
  val blockUnknownAtNight: Boolean = false,
  val autoBlockCritical: Boolean = false,
)

data class PhoneRiskResult(
  val score: Int,
  val trustRating: Int,
  val category: String,
  val action: String,
  val reasons: List<String>,
)

object PhoneReputationPolicy {
  fun evaluate(input: PhoneRiskInput): PhoneRiskResult {
    val reasons = mutableListOf<String>()
    var score = 0

    if (input.blocked) {
      score = 100
      reasons += "Number is on the local block list"
    }
    if (input.verificationStatus == "failed") {
      score = maxOf(score, 70)
      reasons += "Android caller ID verification failed"
    } else if (input.verificationStatus == "unverified") {
      score += 10
      reasons += "Caller ID is not verified"
    }
    if (input.hidden) {
      score += if (input.blockHidden) 85 else 35
      reasons += "Caller number is hidden"
    }
    if (input.international) {
      score += if (input.blockInternational) 70 else 25
      reasons += "International number"
    }
    if (input.complaintCount > 0) {
      score += minOf(60, input.complaintCount * 18)
      reasons += "${input.complaintCount} local complaint(s)"
    }
    if (input.recentCallCount >= 4) {
      score += if (input.blockRepeated && input.recentCallCount >= 7) 55 else 25
      reasons += "Repeated calls in a short period"
    }
    if (input.distinctRecentCallers >= 8) {
      score += 30
      reasons += "Burst of calls from rapidly changing numbers"
    }
    if (input.quietHours && input.blockUnknownAtNight && !input.trusted) {
      score = maxOf(score, 85)
      reasons += "Unknown caller during protected night hours"
    }
    if (input.trusted && input.verificationStatus != "failed") {
      score = minOf(score, 10)
      reasons.clear()
      reasons += "Number is on the local trusted list"
    }

    score = score.coerceIn(0, 100)
    val category = when {
      input.blocked -> "blocked"
      input.trusted && score < 65 -> "trusted"
      input.complaintCount > 0 -> "reported_spam"
      score >= 65 -> "suspected_spam"
      else -> "unknown"
    }
    val action = when {
      score >= 85 && input.autoBlockCritical -> "block"
      score >= 65 -> "suggest_reject"
      score >= 35 -> "warn"
      else -> "allow"
    }
    return PhoneRiskResult(score, 100 - score, category, action, reasons.ifEmpty { listOf("No local risk signals") })
  }
}
