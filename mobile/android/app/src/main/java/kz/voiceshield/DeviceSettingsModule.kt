package kz.voiceshield

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DeviceSettingsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = "DeviceSettingsModule"

  @ReactMethod
  fun getDeviceInfo(promise: Promise) {
    val result = com.facebook.react.bridge.Arguments.createMap()
    result.putString("manufacturer", Build.MANUFACTURER)
    result.putString("model", Build.MODEL)
    result.putInt("androidApi", Build.VERSION.SDK_INT)
    promise.resolve(result)
  }

  @ReactMethod
  fun isIgnoringBatteryOptimizations(promise: Promise) {
    val manager = context.getSystemService(PowerManager::class.java)
    promise.resolve(manager.isIgnoringBatteryOptimizations(context.packageName))
  }

  @ReactMethod
  fun openBatteryOptimizationSettings() {
    context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  @ReactMethod
  fun openAppSettings() {
    val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
  }
}
