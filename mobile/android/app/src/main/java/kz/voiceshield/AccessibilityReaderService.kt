package kz.voiceshield

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import com.facebook.react.bridge.Arguments

class AccessibilityReaderService : AccessibilityService() {
  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    val text = event?.text?.joinToString(" ")?.trim().orEmpty()
    if (text.isBlank()) return
    val payload = Arguments.createMap()
    payload.putString("text", text)
    payload.putString("packageName", event?.packageName?.toString())
    AppRegistry.sendEvent("VS_ACCESSIBILITY_TEXT", payload)
  }

  override fun onInterrupt() = Unit
}
