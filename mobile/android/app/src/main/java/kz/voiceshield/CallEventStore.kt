package kz.voiceshield

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

data class SafeCallEvent(
  val direction: String,
  val verificationStatus: String,
  val detectedAt: Long,
) {
  fun toWritableMap(): WritableMap = Arguments.createMap().apply {
    putString("direction", direction)
    putString("verificationStatus", verificationStatus)
    putDouble("detectedAt", detectedAt.toDouble())
  }
}

object CallEventStore {
  private const val PREFS = "voiceshield_call_event_v1"

  fun save(context: Context, event: SafeCallEvent) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString("direction", event.direction)
      .putString("verificationStatus", event.verificationStatus)
      .putLong("detectedAt", event.detectedAt)
      .apply()
  }

  fun consume(context: Context): SafeCallEvent? {
    val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val detectedAt = preferences.getLong("detectedAt", 0L)
    if (detectedAt <= 0L) return null
    val event = SafeCallEvent(
      direction = preferences.getString("direction", "unknown") ?: "unknown",
      verificationStatus = preferences.getString("verificationStatus", "unverified") ?: "unverified",
      detectedAt = detectedAt,
    )
    preferences.edit().clear().apply()
    return event
  }
}
