package kz.voiceshield

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

object LiveAlertNotifier {
  private const val CHANNEL_ID = "vs_live_alert"
  private const val NOTIF_ID = 9001

  fun show(context: Context, risk: String, score: Int, schemeLabel: String) {
    if (risk != "critical" && risk != "high") return
    val manager = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Live call threat alerts", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Critical or high threat detected during live protection"
          enableVibration(true)
        },
      )
    }
    val openApp = PendingIntent.getActivity(
      context,
      802,
      Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val emoji = if (risk == "critical") "🔴" else "🟠"
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle("$emoji ${risk.replaceFirstChar { it.uppercase() }} threat detected — $score/100")
      .setContentText(schemeLabel)
      .setStyle(NotificationCompat.BigTextStyle().bigText("$schemeLabel\n\nDo not share codes, card numbers or passwords. End the call."))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setAutoCancel(true)
      .setContentIntent(openApp)
      .build()
    manager.notify(NOTIF_ID, notification)
  }

  fun cancel(context: Context) {
    context.getSystemService(NotificationManager::class.java).cancel(NOTIF_ID)
  }
}
