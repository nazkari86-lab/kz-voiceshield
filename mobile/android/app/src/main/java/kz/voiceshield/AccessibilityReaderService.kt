package kz.voiceshield

import android.accessibilityservice.AccessibilityService
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import com.facebook.react.bridge.Arguments

class AccessibilityReaderService : AccessibilityService() {
  private var lastRejectedAt = 0L
  private var lastRejectedReason = ""

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (!ProtectionSessionState.isActive()) return
    if (event == null) return
    val source = event.source
    val text = event.text?.joinToString(" ")?.trim()
      .orEmpty()
      .ifBlank { source?.text?.toString()?.trim().orEmpty() }
    val packageName = event.packageName?.toString()
    val contentDescription = event.contentDescription?.toString()
      ?: source?.contentDescription?.toString()
    if (text.isBlank() && contentDescription.isNullOrBlank() && packageName.isNullOrBlank()) return

    val decision = CaptionSourcePolicy.evaluateText(
      packageName = packageName,
      eventType = event.eventType,
      eventClassName = event.className?.toString(),
      sourceClassName = source?.className?.toString(),
      sourceViewId = source?.viewIdResourceName,
      text = text,
      contentDescription = contentDescription,
    )

    val payload = Arguments.createMap()
    if (decision.accepted && text.isNotBlank()) {
      payload.putString("text", text)
      payload.putString("captureStatus", "caption")
    } else {
      maybeLogRejected(event, text, contentDescription, decision.reason)
      maybeAttachRejectedStatus(payload, decision.reason)
    }
    AppContextClassifier.classify(packageName)?.let { payload.putString("appSignalId", it) }
    if (payload.hasKey("text") || payload.hasKey("appSignalId") || payload.hasKey("captureStatus")) {
      AppRegistry.sendEvent("VS_ACCESSIBILITY_TEXT", payload)
    }
  }

  override fun onInterrupt() {
    ProtectionSessionState.setActive(false)
  }

  override fun onDestroy() {
    ProtectionSessionState.setActive(false)
    super.onDestroy()
  }

  private fun maybeAttachRejectedStatus(payload: com.facebook.react.bridge.WritableMap, reason: String) {
    val now = System.currentTimeMillis()
    if (reason == lastRejectedReason && now - lastRejectedAt < 5000L) return
    lastRejectedReason = reason
    lastRejectedAt = now
    payload.putString("captureStatus", "rejected")
    payload.putString("captureReason", reason)
  }

  private fun maybeLogRejected(
    event: AccessibilityEvent,
    text: String,
    contentDescription: String?,
    reason: String,
  ) {
    val now = System.currentTimeMillis()
    if (reason == lastRejectedReason && now - lastRejectedAt < 5000L) return
    val source = event.source
    Log.d(
      "VSAccessibility",
      "caption_rejected reason=$reason package=${event.packageName} class=${event.className} " +
        "type=${event.eventType} window=${event.windowId} sourceClass=${source?.className} " +
        "viewId=${source?.viewIdResourceName} text=${text.take(120)} content=${contentDescription?.take(120)}",
    )
  }
}
