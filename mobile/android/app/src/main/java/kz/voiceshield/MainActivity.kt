package kz.voiceshield

import android.Manifest
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.bridge.Arguments
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  override fun getMainComponentName(): String = "kzvoiceshield"

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    requestRuntimePermissions()
  }

  override fun onResume() {
    super.onResume()
    AppRegistry.sendEvent("VS_APP_RESUMED", Arguments.createMap())
  }

  private fun requestRuntimePermissions() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.POST_NOTIFICATIONS), 1001)
    } else {
      requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1001)
    }
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    val payload = Arguments.createMap()
    payload.putInt("requestCode", requestCode)
    payload.putInt("granted", grantResults.count { it == android.content.pm.PackageManager.PERMISSION_GRANTED })
    AppRegistry.sendEvent("VS_PERMISSIONS_RESULT", payload)
  }

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
