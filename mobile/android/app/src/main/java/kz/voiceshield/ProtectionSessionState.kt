package kz.voiceshield

object ProtectionSessionState {
  @Volatile private var active = false
  @Volatile private var enhancedCaptionFiltering = false

  fun isActive(): Boolean = active
  fun enhancedCaptionFiltering(): Boolean = enhancedCaptionFiltering
  fun setActive(value: Boolean) {
    active = value
  }
  fun setEnhancedCaptionFiltering(value: Boolean) {
    enhancedCaptionFiltering = value
  }
}
