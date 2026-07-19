package kz.voiceshield

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

class VoiceShieldWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) { ids.forEach { updateView(context, manager, it) } }
  companion object {
    private const val PREFS = "voiceshield_widget_v1"
    fun update(context: Context, score: Int, level: String) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt("score", score).putString("level", level).apply()
      val manager = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, VoiceShieldWidgetProvider::class.java)
      manager.getAppWidgetIds(component).forEach { updateView(context, manager, it) }
    }
    private fun updateView(context: Context, manager: AppWidgetManager, id: Int) {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val score = prefs.getInt("score", 0)
      val level = prefs.getString("level", "standby") ?: "standby"
      val views = RemoteViews(context.packageName, R.layout.widget_voice_shield).apply {
        setTextViewText(R.id.widget_title, "KZ VoiceShield")
        setTextViewText(R.id.widget_score, if (score > 0) "$score/100" else "READY")
        setTextViewText(R.id.widget_status, level.uppercase())
        val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 7001, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      }
      manager.updateAppWidget(id, views)
    }
  }
}
