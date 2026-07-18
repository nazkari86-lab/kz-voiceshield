package kz.voiceshield

import android.accessibilityservice.AccessibilityService
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityEvent
import com.facebook.react.bridge.Arguments

class AccessibilityReaderService : AccessibilityService() {
  private var lastRejectedAt = 0L
  private var lastRejectedReason = ""
  private var lastAcceptedText = ""

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
      enhancedInspection = ProtectionSessionState.enhancedCaptionFiltering(),
    )

    val payload = Arguments.createMap()
    val fallback = if (!decision.accepted && ProtectionSessionState.enhancedCaptionFiltering()) findCaptionTextInTree(event) else null
    val acceptedText = when {
      decision.accepted && text.isNotBlank() -> text
      fallback != null -> fallback
      else -> null
    }
    if (!acceptedText.isNullOrBlank()) {
      if (acceptedText == lastAcceptedText) return
      lastAcceptedText = acceptedText
      payload.putString("text", acceptedText)
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

  private fun findCaptionTextInTree(event: AccessibilityEvent): String? {
    val root = rootInActiveWindow ?: return null
    val queue = ArrayDeque<AccessibilityNodeInfo>()
    queue.add(root)
    var inspected = 0
    while (queue.isNotEmpty() && inspected < MAX_TREE_NODES) {
      val node = queue.removeFirst()
      inspected += 1
      val nodeText = node.text?.toString()?.trim().orEmpty()
      val nodeDescription = node.contentDescription?.toString()?.trim()
      val candidate = nodeText.ifBlank { nodeDescription.orEmpty() }
      if (candidate.isNotBlank()) {
        val decision = CaptionSourcePolicy.evaluateText(
          packageName = node.packageName?.toString() ?: event.packageName?.toString(),
          eventType = event.eventType,
          eventClassName = event.className?.toString(),
          sourceClassName = node.className?.toString(),
          sourceViewId = node.viewIdResourceName,
          text = nodeText,
          contentDescription = nodeDescription,
          enhancedInspection = true,
        )
        if (decision.accepted && CaptionSourcePolicy.looksLikeCaptionUtterance(candidate)) return candidate
      }
      for (index in 0 until node.childCount) {
        node.getChild(index)?.let(queue::add)
      }
    }
    return null
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

  companion object {
    private const val MAX_TREE_NODES = 160
  }
}
