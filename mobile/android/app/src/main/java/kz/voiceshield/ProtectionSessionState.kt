package kz.voiceshield

object ProtectionSessionState {
  @Volatile private var active = false

  fun isActive(): Boolean = active
  fun setActive(value: Boolean) {
    active = value
  }
}
