package kz.voiceshield

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class OverlayModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = "OverlayModule"

  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  @ReactMethod fun canDrawOverlays(promise: Promise) = promise.resolve(Settings.canDrawOverlays(context))

  @ReactMethod
  fun openOverlaySettings() {
    val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  @ReactMethod
  fun show(promise: Promise) {
    context.startService(Intent(context, OverlayService::class.java))
    promise.resolve(null)
  }

  @ReactMethod
  fun hide(promise: Promise) {
    context.stopService(Intent(context, OverlayService::class.java))
    promise.resolve(null)
  }

  @ReactMethod
  fun updateRisk(score: Int, level: String, source: String, promise: Promise) {
    AppRegistry.overlayService?.updateRisk(score, level, source)
    promise.resolve(null)
  }
}
