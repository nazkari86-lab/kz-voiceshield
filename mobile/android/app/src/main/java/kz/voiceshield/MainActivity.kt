package kz.voiceshield

import android.content.Intent
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
    receiveSharedText(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    receiveSharedText(intent)
  }

  override fun onResume() {
    super.onResume()
    AppRegistry.sendEvent("VS_APP_RESUMED", Arguments.createMap())
  }

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  private fun receiveSharedText(intent: Intent?) {
    if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") return
    val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.take(20_000).orEmpty()
    if (text.isEmpty()) return
    ShareIntentModule.pendingText = text
    val payload = Arguments.createMap()
    payload.putString("text", text)
    AppRegistry.sendEvent("VS_SHARED_TEXT", payload)
  }
}
