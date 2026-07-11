package kz.voiceshield

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import org.json.JSONArray

data class SafeCallEvent(
  val direction: String,
  val verificationStatus: String,
  val detectedAt: Long,
  val assessment: PhoneAssessment? = null,
) {
  fun toWritableMap(): WritableMap = Arguments.createMap().apply {
    putString("direction", direction)
    putString("verificationStatus", verificationStatus)
    putDouble("detectedAt", detectedAt.toDouble())
    assessment?.let { putMap("reputation", it.toWritableMap()) }
  }
}

object CallEventStore {
  private const val PREFS = "voiceshield_call_event_v1"

  fun save(context: Context, event: SafeCallEvent) {
    val editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .remove("numberKey")
      .remove("maskedNumber")
      .remove("score")
      .remove("trustRating")
      .remove("category")
      .remove("action")
      .remove("reasons")
      .remove("complaintCount")
      .remove("lastComplaintAt")
      .putString("direction", event.direction)
      .putString("verificationStatus", event.verificationStatus)
      .putLong("detectedAt", event.detectedAt)
    event.assessment?.let { assessment ->
      editor
        .putString("numberKey", assessment.numberKey)
        .putString("maskedNumber", assessment.maskedNumber)
        .putInt("score", assessment.result.score)
        .putInt("trustRating", assessment.result.trustRating)
        .putString("category", assessment.result.category)
        .putString("action", assessment.result.action)
        .putString("reasons", JSONArray(assessment.result.reasons).toString())
        .putInt("complaintCount", assessment.complaintCount)
        .putLong("lastComplaintAt", assessment.lastComplaintAt)
    }
    editor.apply()
  }

  fun consume(context: Context): SafeCallEvent? {
    val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val detectedAt = preferences.getLong("detectedAt", 0L)
    if (detectedAt <= 0L) return null
    val reasonsJson = preferences.getString("reasons", null)
    val assessment = preferences.getString("numberKey", null)?.let { numberKey ->
      val reasons = mutableListOf<String>()
      val array = runCatching { JSONArray(reasonsJson ?: "[]") }.getOrDefault(JSONArray())
      for (index in 0 until array.length()) array.optString(index).takeIf { it.isNotBlank() }?.let(reasons::add)
      PhoneAssessment(
        numberKey = numberKey,
        maskedNumber = preferences.getString("maskedNumber", "Unknown") ?: "Unknown",
        result = PhoneRiskResult(
          score = preferences.getInt("score", 0),
          trustRating = preferences.getInt("trustRating", 100),
          category = preferences.getString("category", "unknown") ?: "unknown",
          action = preferences.getString("action", "allow") ?: "allow",
          reasons = reasons,
        ),
        complaintCount = preferences.getInt("complaintCount", 0),
        lastComplaintAt = preferences.getLong("lastComplaintAt", 0),
      )
    }
    val event = SafeCallEvent(
      direction = preferences.getString("direction", "unknown") ?: "unknown",
      verificationStatus = preferences.getString("verificationStatus", "unverified") ?: "unverified",
      detectedAt = detectedAt,
      assessment = assessment,
    )
    preferences.edit().clear().apply()
    return event
  }
}
