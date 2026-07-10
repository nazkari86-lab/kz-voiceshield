package kz.voiceshield

import com.facebook.react.bridge.ReactApplicationContext

object AppRegistry {
  @Volatile var reactContext: ReactApplicationContext? = null
  @Volatile var overlayService: OverlayService? = null
  @Volatile var whisperModule: WhisperModule? = null

  fun sendEvent(name: String, payload: com.facebook.react.bridge.WritableMap) {
    val ctx = reactContext ?: return
    // The context object can exist before the JS bundle/catalyst instance is
    // ready (e.g. MainActivity.onResume fires during cold start). Calling
    // getJSModule() then throws IllegalStateException and crashes the app, so
    // drop the event until the React instance is active. The try/catch covers
    // the race where the instance is torn down between the check and emit().
    if (!ctx.hasActiveReactInstance()) return
    try {
      ctx.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(name, payload)
    } catch (_: Exception) {
    }
  }
}
