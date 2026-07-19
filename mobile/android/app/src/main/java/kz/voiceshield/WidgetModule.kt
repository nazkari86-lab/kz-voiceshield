package kz.voiceshield

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WidgetModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "WidgetModule"
  @ReactMethod fun updateRisk(score: Int, level: String, promise: Promise) {
    VoiceShieldWidgetProvider.update(context, score.coerceIn(0, 100), level.take(32))
    promise.resolve(true)
  }
}
