package kz.voiceshield

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import com.facebook.react.bridge.Arguments

class AccessibilityReaderService : AccessibilityService() {
  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    val text = event?.text?.joinToString(" ")?.trim().orEmpty()
    val packageName = event?.packageName?.toString()
    if (text.isBlank() && packageName.isNullOrBlank()) return
    val payload = Arguments.createMap()
    if (text.isNotBlank()) payload.putString("text", text)
    if (!packageName.isNullOrBlank()) payload.putString("packageName", packageName)
    AppRegistry.sendEvent("VS_ACCESSIBILITY_TEXT", payload)
  }

  override fun onInterrupt() = Unit
}
