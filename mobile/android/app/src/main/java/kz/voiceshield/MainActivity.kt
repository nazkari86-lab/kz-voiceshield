package kz.voiceshield

import android.content.Intent
import android.net.Uri
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
    receiveSharedContent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    receiveSharedContent(intent)
  }

  override fun onResume() {
    super.onResume()
    AppRegistry.sendEvent("VS_APP_RESUMED", Arguments.createMap())
  }

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  private fun receiveSharedContent(intent: Intent?) {
    if (intent?.action == ACTION_OPEN_LIVE_PROTECTION) {
      ShareIntentModule.pendingLiveShield = true
      AppRegistry.sendEvent("VS_OPEN_LIVE_PROTECTION", Arguments.createMap())
      return
    }
    if (intent?.action != Intent.ACTION_SEND) return
    val mimeType = intent.type ?: return
    when {
      mimeType == "text/plain" -> receiveSharedText(intent)
      mimeType.startsWith("audio/") || mimeType == "application/ogg" -> receiveSharedAudio(intent)
      mimeType.startsWith("image/") || mimeType == "application/pdf" || mimeType == "application/json" ||
        mimeType == "application/csv" || mimeType == "application/zip" || mimeType == "application/x-zip-compressed" ||
        mimeType == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" -> receiveSharedChatAttachment(intent)
    }
  }

  private fun receiveSharedText(intent: Intent) {
    val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.take(20_000).orEmpty()
    if (text.isEmpty()) return
    ShareIntentModule.pendingText = text
    val payload = Arguments.createMap()
    payload.putString("text", text)
    AppRegistry.sendEvent("VS_SHARED_TEXT", payload)
  }

  private fun receiveSharedAudio(intent: Intent) {
    val uri: Uri? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(Intent.EXTRA_STREAM)
    }
    uri ?: return
    VoiceMessageModule.pendingAudioUri = uri
    AppRegistry.sendEvent("VS_SHARED_AUDIO", Arguments.createMap())
  }

  private fun receiveSharedChatAttachment(intent: Intent) {
    val uri: Uri? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(Intent.EXTRA_STREAM)
    }
    uri ?: return
    ChatAttachmentModule.queueSharedAttachment(uri, intent.flags)
    AppRegistry.sendEvent("VS_SHARED_CHAT_ATTACHMENT", Arguments.createMap())
  }

  companion object {
    const val ACTION_OPEN_LIVE_PROTECTION = "kz.voiceshield.action.OPEN_LIVE_PROTECTION"
  }
}
