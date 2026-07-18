package kz.voiceshield

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptionSourcePolicyTest {
  @Test fun allowsKnownSystemCaptionPackages() {
    assertTrue(CaptionSourcePolicy.allowsText("com.android.systemui"))
    assertTrue(CaptionSourcePolicy.allowsText("com.google.android.as"))
  }

  @Test fun rejectsBankAndArbitraryApplicationText() {
    assertFalse(CaptionSourcePolicy.allowsText("kz.kaspi.mobile"))
    assertFalse(CaptionSourcePolicy.allowsText("com.example.unknown"))
    assertFalse(CaptionSourcePolicy.allowsText(null))
  }

  @Test fun rejectsNotificationAndOwnApplicationText() {
    assertFalse(CaptionSourcePolicy.evaluateText(
      packageName = "com.android.systemui",
      eventType = CaptionSourcePolicy.TYPE_NOTIFICATION_STATE_CHANGED,
      eventClassName = "android.app.Notification",
      sourceClassName = null,
      sourceViewId = null,
      text = "KZ VoiceShield Call in progress VoiceShield protection active",
      contentDescription = null,
    ).accepted)

    assertFalse(CaptionSourcePolicy.evaluateText(
      packageName = "kz.voiceshield",
      eventType = CaptionSourcePolicy.TYPE_WINDOW_CONTENT_CHANGED,
      eventClassName = "android.widget.TextView",
      sourceClassName = null,
      sourceViewId = null,
      text = "End contact, verify through official saved channels",
      contentDescription = null,
    ).accepted)
  }

  @Test fun rejectsSystemUiTextWithoutCaptionNodeMarker() {
    val decision = CaptionSourcePolicy.evaluateText(
      packageName = "com.android.systemui",
      eventType = CaptionSourcePolicy.TYPE_WINDOW_CONTENT_CHANGED,
      eventClassName = "android.widget.FrameLayout",
      sourceClassName = "android.widget.TextView",
      sourceViewId = null,
      text = "That's his foot man. Download complete.",
      contentDescription = null,
    )

    assertFalse(decision.accepted)
  }

  @Test fun acceptsSystemUiTextOnlyFromCaptionLikeNode() {
    val decision = CaptionSourcePolicy.evaluateText(
      packageName = "com.android.systemui",
      eventType = CaptionSourcePolicy.TYPE_WINDOW_CONTENT_CHANGED,
      eventClassName = "com.android.systemui.accessibility.LiveCaptionOverlay",
      sourceClassName = "android.widget.TextView",
      sourceViewId = "com.android.systemui:id/live_caption_text",
      text = "Здравствуйте, это служба безопасности банка.",
      contentDescription = null,
    )

    assertTrue(decision.accepted)
  }

  @Test fun acceptsGoogleSpeechCaptionProviderText() {
    val decision = CaptionSourcePolicy.evaluateText(
      packageName = "com.google.audio.hearing.visualization.accessibility.scribe",
      eventType = CaptionSourcePolicy.TYPE_WINDOW_CONTENT_CHANGED,
      eventClassName = "android.widget.TextView",
      sourceClassName = null,
      sourceViewId = null,
      text = "Скажите код из SMS",
      contentDescription = null,
    )

    assertTrue(decision.accepted)
  }
}
