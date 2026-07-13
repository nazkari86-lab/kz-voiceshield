package kz.voiceshield

import android.content.Intent
import android.content.ComponentName
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
  fun requestBatteryOptimizationExemption() {
    val intent = Intent(
      Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
      Uri.parse("package:${context.packageName}"),
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
      .onFailure { openBatteryOptimizationSettings() }
  }

  @ReactMethod
  fun openCaptionSettings() {
    val intent = Intent(Settings.ACTION_CAPTIONING_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
      .onFailure { context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
  }

  @ReactMethod
  fun openDefaultAppsSettings() {
    val intent = Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
      .onFailure { openAppSettings() }
  }

  @ReactMethod
  fun openAutostartSettings() {
    val candidates = listOf(
      ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
      ComponentName("com.miui.securitycenter", "com.miui.powercenter.PowerSettings"),
      ComponentName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity"),
    )
    val opened = candidates.any { component ->
      runCatching {
        context.startActivity(Intent().setComponent(component).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
      }.getOrDefault(false)
    }
    if (!opened) openAppSettings()
  }

  @ReactMethod
  fun openAppSettings() {
    val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
  }
}
