package kz.voiceshield

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class LiveAlertModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "LiveAlertModule"

  @ReactMethod
  fun showThreatAlert(risk: String, score: Int, schemeLabel: String) {
    LiveAlertNotifier.show(reactApplicationContext, risk, score, schemeLabel)
  }

  @ReactMethod
  fun cancelAlert() {
    LiveAlertNotifier.cancel(reactApplicationContext)
  }
}
