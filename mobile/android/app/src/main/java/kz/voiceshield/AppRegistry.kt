package kz.voiceshield

import com.facebook.react.bridge.ReactApplicationContext

object AppRegistry {
  @Volatile var reactContext: ReactApplicationContext? = null
  @Volatile var overlayService: OverlayService? = null
  @Volatile var whisperModule: WhisperModule? = null

  fun sendEvent(name: String, payload: com.facebook.react.bridge.WritableMap) {
    reactContext
      ?.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit(name, payload)
  }
}
