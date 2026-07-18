package kz.voiceshield

object CaptionSourcePolicy {
  const val TYPE_VIEW_TEXT_CHANGED = 16
  const val TYPE_WINDOW_STATE_CHANGED = 32
  const val TYPE_NOTIFICATION_STATE_CHANGED = 64
  const val TYPE_WINDOW_CONTENT_CHANGED = 2048

  private val allowedPackages = setOf(
    "com.android.systemui",
    "com.google.android.as",
    "com.google.android.apps.accessibility.soundamplifier",
    "com.google.audio.hearing.visualization.accessibility.scribe",
    "com.miui.accessibility",
    "com.miui.system",
  )

  private val systemUiPackages = setOf(
    "com.android.systemui",
    "com.miui.system",
    "com.miui.accessibility",
  )

  private val acceptedEventTypes = setOf(
    TYPE_VIEW_TEXT_CHANGED,
    TYPE_WINDOW_CONTENT_CHANGED,
    TYPE_WINDOW_STATE_CHANGED,
  )

  private val captionMarkers = listOf(
    "caption",
    "subtitle",
    "subtitles",
    "transcription",
    "transcript",
    "livecaption",
    "live_caption",
    "closedcaption",
    "closed_caption",
    "accessibility_caption",
  )

  private val blockedTextFragments = listOf(
    "voiceshield protection active",
    "kz voiceshield",
    "call in progress",
    "monitoring call risk",
    "download complete",
    "downloaded apk",
    "notification shade",
    "quick settings",
    "панель уведомлений",
    "шторка уведомлений",
    "скачивание завершено",
    "загрузка завершена",
    "уведомление",
    "tiktok",
  )

  fun allowsText(packageName: String?): Boolean = packageName != null && packageName in allowedPackages

  fun evaluateText(
    packageName: String?,
    eventType: Int,
    eventClassName: String?,
    sourceClassName: String?,
    sourceViewId: String?,
    text: String?,
    contentDescription: String?,
  ): CaptionDecision {
    val pkg = packageName?.lowercase().orEmpty()
    val body = text?.trim().orEmpty()
    val description = contentDescription?.trim().orEmpty()
    val combinedText = "$body $description".trim()
    if (pkg == "kz.voiceshield") return CaptionDecision(false, "own_app")
    if (pkg.isBlank() || pkg !in allowedPackages) return CaptionDecision(false, "package_not_allowed")
    if (eventType == TYPE_NOTIFICATION_STATE_CHANGED) return CaptionDecision(false, "notification_event")
    if (eventType !in acceptedEventTypes) return CaptionDecision(false, "event_not_allowed")
    if (combinedText.isBlank()) return CaptionDecision(false, "blank_text")
    if (looksLikeBlockedUiText(combinedText)) return CaptionDecision(false, "notification_or_app_ui")

    val sourceFingerprint = listOf(eventClassName, sourceClassName, sourceViewId)
      .filterNotNull()
      .joinToString(" ")
      .lowercase()
    val hasCaptionMarker = captionMarkers.any(sourceFingerprint::contains)

    if (pkg in systemUiPackages && !hasCaptionMarker) {
      return CaptionDecision(false, "systemui_without_caption_node")
    }

    return CaptionDecision(true, "caption")
  }

  private fun looksLikeBlockedUiText(text: String): Boolean {
    val normalized = text.lowercase()
    return blockedTextFragments.any(normalized::contains)
  }
}

data class CaptionDecision(
  val accepted: Boolean,
  val reason: String,
)
