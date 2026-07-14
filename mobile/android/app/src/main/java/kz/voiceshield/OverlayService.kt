package kz.voiceshield

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.pm.ServiceInfo
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.Gravity
import android.view.WindowManager
import android.widget.TextView
import androidx.core.app.NotificationCompat

class OverlayService : Service() {
  private var view: TextView? = null
  private lateinit var windowManager: WindowManager
  private var criticalAlerted = false

  override fun onCreate() {
    super.onCreate()
    AppRegistry.overlayService = this
    windowManager = getSystemService(WindowManager::class.java)
    createChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = NotificationCompat.Builder(this, "vs_overlay")
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(getString(R.string.overlay_notification_title))
      .setContentText(getString(R.string.overlay_notification_body))
      .setOngoing(true)
      .setContentIntent(openAppIntent())
      .setAutoCancel(false)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val useMicrophone = intent?.getBooleanExtra(EXTRA_USE_MICROPHONE, false) == true
      val serviceType = when {
        useMicrophone -> ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE -> ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        else -> 0
      }
      startForeground(7, notification, serviceType)
    } else {
      startForeground(7, notification)
    }
    // The phone application covers the React Native activity during a call.
    // Show a neutral badge immediately so the user can confirm protection is
    // active before the first transcript/risk event arrives.
    if (view == null) updateRisk(0, "low", "Listening")
    return START_NOT_STICKY
  }

  fun updateRisk(score: Int, level: String, source: String) {
    // WindowManager.addView / updateViewLayout MUST run on the main/UI thread.
    // The RN bridge calls this from a background thread → wrap in Handler(mainLooper).
    Handler(Looper.getMainLooper()).post {
      val badge = view ?: TextView(this).also {
        it.setTextColor(android.graphics.Color.WHITE)
        it.textSize = 14f
        it.setPadding(22, 14, 22, 14)
        it.contentDescription = "VoiceShield call risk. Tap to open the protection screen."
        it.isClickable = true
        it.setOnClickListener { startActivity(openAppActivityIntent()) }
        it.setBackgroundResource(R.drawable.overlay_badge_bg)
        val params = WindowManager.LayoutParams(
          WindowManager.LayoutParams.WRAP_CONTENT,
          WindowManager.LayoutParams.WRAP_CONTENT,
          WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
          PixelFormat.TRANSLUCENT,
        )
        params.gravity = Gravity.TOP or Gravity.END
        params.x = 28
        params.y = 120
        windowManager.addView(it, params)
        view = it
      }
      val critical = score >= 85 || level == "critical"
      badge.text = if (critical) "VS $score CRITICAL · END CALL" else "VS $score $level · $source"
      if (critical && !criticalAlerted) {
        criticalAlerted = true
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          getSystemService(VibratorManager::class.java).defaultVibrator
        } else {
          @Suppress("DEPRECATION")
          getSystemService(Vibrator::class.java)
        }
        vibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 300, 150, 300), -1))
      } else if (!critical) {
        criticalAlerted = false
      }
    }
  }

  override fun onDestroy() {
    view?.let { windowManager.removeView(it) }
    view = null
    criticalAlerted = false
    AppRegistry.overlayService = null
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel("vs_overlay", getString(R.string.overlay_channel_name), NotificationManager.IMPORTANCE_LOW)
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  private fun openAppActivityIntent(): Intent = Intent(this, MainActivity::class.java).apply {
    action = ACTION_OPEN_LIVE_PROTECTION
    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
  }

  private fun openAppIntent(): PendingIntent = PendingIntent.getActivity(
    this,
    0,
    openAppActivityIntent(),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
  )

  companion object {
    const val EXTRA_USE_MICROPHONE = "kz.voiceshield.extra.USE_MICROPHONE"
    const val ACTION_OPEN_LIVE_PROTECTION = "kz.voiceshield.action.OPEN_LIVE_PROTECTION"
  }
}
