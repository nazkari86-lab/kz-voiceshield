package kz.voiceshield

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

object PostCallReviewNotifier {
  private const val CHANNEL_ID = "vs_post_call_review"

  fun show(context: Context, assessment: PhoneAssessment?, disconnectReason: String) {
    val manager = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "VoiceShield post-call review", NotificationManager.IMPORTANCE_DEFAULT).apply {
          description = "Review recent calls, save evidence and update local number rules"
        },
      )
    }
    val openLive = PendingIntent.getActivity(
      context,
      9142,
      Intent(context, MainActivity::class.java).apply {
        action = MainActivity.ACTION_OPEN_LIVE_PROTECTION
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val title = when {
      assessment == null -> "Review ended call"
      assessment.result.score >= 65 -> "Review suspicious ended call"
      else -> "Review protected ended call"
    }
    val body = assessment?.let {
      "${it.maskedNumber} · risk ${it.result.score}/100 · ${it.result.action.replace('_', ' ')}"
    } ?: "Disconnect reason: $disconnectReason"
    manager.notify(
      "post:${assessment?.numberKey ?: disconnectReason}".hashCode(),
      NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_notification)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(listOfNotNull(body, assessment?.result?.reasons?.joinToString(" · ")).joinToString("\n")))
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        .setAutoCancel(true)
        .setContentIntent(openLive)
        .build(),
    )
  }
}
