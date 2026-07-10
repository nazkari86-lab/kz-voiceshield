package kz.voiceshield

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import com.facebook.react.bridge.Arguments

class AccessibilityReaderService : AccessibilityService() {
  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (!ProtectionSessionState.isActive()) return
    val text = event?.text?.joinToString(" ")?.trim().orEmpty()
    val packageName = event?.packageName?.toString()
    if (text.isBlank() && packageName.isNullOrBlank()) return
    val payload = Arguments.createMap()
    if (text.isNotBlank() && CaptionSourcePolicy.allowsText(packageName)) payload.putString("text", text)
    AppContextClassifier.classify(packageName)?.let { payload.putString("appSignalId", it) }
    AppRegistry.sendEvent("VS_ACCESSIBILITY_TEXT", payload)
  }

  override fun onInterrupt() {
    ProtectionSessionState.setActive(false)
  }

  override fun onDestroy() {
    ProtectionSessionState.setActive(false)
    super.onDestroy()
  }
}
