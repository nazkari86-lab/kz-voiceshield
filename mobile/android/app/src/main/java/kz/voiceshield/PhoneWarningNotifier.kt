package kz.voiceshield

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

object PhoneWarningNotifier {
  private const val CHANNEL_ID = "vs_call_warning"

  fun show(context: Context, assessment: PhoneAssessment) {
    if (assessment.result.score < 35) return
    val manager = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Suspicious call warnings", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Warnings produced by local VoiceShield call reputation rules"
          enableVibration(true)
        },
      )
    }
    val openApp = PendingIntent.getActivity(
      context,
      801,
      Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val title = if (assessment.result.action == "block") "Critical call blocked" else "Suspicious incoming call"
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(title)
      .setContentText("${assessment.maskedNumber} · risk ${assessment.result.score}/100 · ${assessment.result.reasons.firstOrNull() ?: "local signal"}")
      .setStyle(NotificationCompat.BigTextStyle().bigText(assessment.result.reasons.joinToString(" · ")))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setAutoCancel(true)
      .setContentIntent(openApp)
      .build()
    manager.notify(assessment.numberKey.hashCode(), notification)
  }
}

