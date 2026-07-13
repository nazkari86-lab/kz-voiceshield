package kz.voiceshield

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
      intent.action != "android.intent.action.QUICKBOOT_POWERON"
    ) return
    // Re-arm PhoneWarningNotifier channel so it's ready on first incoming call.
    // We do not auto-start the overlay (user must explicitly start protection).
    // This receiver ensures the app is registered for call screening after reboot.
    val mgr = context.getSystemService(android.app.NotificationManager::class.java)
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      mgr.createNotificationChannel(
        android.app.NotificationChannel(
          "vs_call_warning",
          "Suspicious call warnings",
          android.app.NotificationManager.IMPORTANCE_HIGH,
        ).apply {
          description = "Warnings produced by local VoiceShield call reputation rules"
          enableVibration(true)
        },
      )
      mgr.createNotificationChannel(
        android.app.NotificationChannel(
          "vs_live_alert",
          "Live call threat alerts",
          android.app.NotificationManager.IMPORTANCE_HIGH,
        ).apply {
          description = "Critical or high threat detected during live protection"
          enableVibration(true)
        },
      )
    }
  }
}
