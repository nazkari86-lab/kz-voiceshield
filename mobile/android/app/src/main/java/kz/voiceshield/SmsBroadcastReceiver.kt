package kz.voiceshield

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments

/** Receives SMS only to surface a local scan prompt; it never sends message text to a server. */
class SmsBroadcastReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) return
    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
    if (messages.isNullOrEmpty()) return
    val body = messages.joinToString("") { it.messageBody.orEmpty() }.trim()
    if (body.isBlank()) return
    val address = messages.firstOrNull()?.originatingAddress.orEmpty()
    val date = messages.firstOrNull()?.timestampMillis ?: System.currentTimeMillis()
    val riskHint = if (Regex("(?i)https?://|код|парол|перевод|срочно|anydesk|құпия|аударым").containsMatchIn(body)) "review" else "unknown"
    context.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit()
      .putString("address", address)
      .putString("body", body)
      .putLong("date", date)
      .putString("riskHint", riskHint)
      .apply()
    AppRegistry.sendEvent("VS_SMS_RECEIVED", Arguments.createMap().apply {
      putString("address", address)
      putString("body", body)
      putDouble("date", date.toDouble())
      putString("riskHint", riskHint)
    })
  }

  companion object { const val STORE = "voiceshield_sms_receiver_v1" }
}
