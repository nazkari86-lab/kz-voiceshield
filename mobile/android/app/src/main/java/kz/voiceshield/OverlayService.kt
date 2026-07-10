package kz.voiceshield

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.TextView
import androidx.core.app.NotificationCompat

class OverlayService : Service() {
  private var view: TextView? = null
  private lateinit var windowManager: WindowManager

  override fun onCreate() {
    super.onCreate()
    AppRegistry.overlayService = this
    windowManager = getSystemService(WindowManager::class.java)
    createChannel()
    startForeground(7, NotificationCompat.Builder(this, "vs_overlay")
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(getString(R.string.overlay_notification_title))
      .setContentText(getString(R.string.overlay_notification_body))
      .build())
  }

  fun updateRisk(score: Int, level: String, source: String) {
    // WindowManager.addView / updateViewLayout MUST run on the main/UI thread.
    // The RN bridge calls this from a background thread → wrap in Handler(mainLooper).
    Handler(Looper.getMainLooper()).post {
      val badge = view ?: TextView(this).also {
        it.setTextColor(android.graphics.Color.WHITE)
        it.textSize = 14f
        it.setPadding(22, 14, 22, 14)
        it.setBackgroundResource(R.drawable.overlay_badge_bg)
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE
        val params = WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, type, WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT)
        params.gravity = Gravity.TOP or Gravity.END
        params.x = 28
        params.y = 120
        windowManager.addView(it, params)
        view = it
      }
      badge.text = "VS $score $level · $source"
    }
  }

  override fun onDestroy() {
    view?.let { windowManager.removeView(it) }
    view = null
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
}
