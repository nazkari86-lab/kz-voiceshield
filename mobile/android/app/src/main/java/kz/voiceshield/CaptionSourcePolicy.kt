package kz.voiceshield

object CaptionSourcePolicy {
  private val allowedPackages = setOf(
    "com.android.systemui",
    "com.google.android.as",
    "com.google.android.apps.accessibility.soundamplifier",
    "com.google.audio.hearing.visualization.accessibility.scribe",
    "com.miui.accessibility",
    "com.miui.system",
  )

  fun allowsText(packageName: String?): Boolean = packageName != null && packageName in allowedPackages
}
