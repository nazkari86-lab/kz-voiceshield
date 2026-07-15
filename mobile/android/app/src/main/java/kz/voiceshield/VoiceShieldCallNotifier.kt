package kz.voiceshield

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telecom.Call
import androidx.core.app.NotificationCompat

object VoiceShieldCallNotifier {
  private const val CHANNEL = "vs_active_calls"
  private const val ID = 9101

  fun show(context: Context, call: Call) {
    val manager = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL, "VoiceShield calls", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Incoming and active SIM call controls"
          lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
          setSound(null, null)
        },
      )
    }
    val number = call.details.handle?.schemeSpecificPart
    val assessment = PhoneReputationStore.assess(context, number, "unverified", false)
    val intent = Intent(context, VoiceShieldCallActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val fullScreen = PendingIntent.getActivity(
      context, ID, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val incoming = call.state == Call.STATE_RINGING
    val title = when {
      assessment.annotation.familyProtected -> assessment.annotation.label.ifBlank { "Family call" }
      incoming -> "Incoming call"
      else -> "Call in progress"
    }
    val notification = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(title)
      .setContentText("${assessment.maskedNumber} · risk ${assessment.result.score}/100")
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(fullScreen)
      .setFullScreenIntent(fullScreen, incoming)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setPublicVersion(
        NotificationCompat.Builder(context, CHANNEL)
          .setSmallIcon(R.drawable.ic_notification)
          .setContentTitle(if (incoming) "Incoming protected call" else "Protected call in progress")
          .setContentText("Open VoiceShield to view number safety details")
          .setCategory(NotificationCompat.CATEGORY_CALL)
          .build(),
      )
      .build()
    manager.notify(ID, notification)
  }

  fun cancel(context: Context) {
    context.getSystemService(NotificationManager::class.java).cancel(ID)
  }
}
