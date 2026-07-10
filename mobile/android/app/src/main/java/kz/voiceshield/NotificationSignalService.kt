package kz.voiceshield

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.facebook.react.bridge.Arguments

class NotificationSignalService : NotificationListenerService() {
  override fun onNotificationPosted(notification: StatusBarNotification?) {
    if (!ProtectionSessionState.isActive()) return
    val extras = notification?.notification?.extras ?: return
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val body = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
    val signalId = NotificationSignalClassifier.classify("$title $body") ?: return
    val payload = Arguments.createMap().apply { putString("signalId", signalId) }
    AppRegistry.sendEvent("VS_NOTIFICATION_SIGNAL", payload)
  }
}
