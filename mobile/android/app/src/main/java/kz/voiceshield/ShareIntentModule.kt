package kz.voiceshield

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ShareIntentModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = "ShareIntentModule"

  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun consumePendingText(promise: Promise) {
    val text = pendingText
    pendingText = null
    promise.resolve(text)
  }

  @ReactMethod
  fun consumePendingLiveShield(promise: Promise) {
    val requested = pendingLiveShield
    pendingLiveShield = false
    promise.resolve(requested)
  }

  companion object {
    @Volatile var pendingText: String? = null
    @Volatile var pendingLiveShield: Boolean = false
  }
}
