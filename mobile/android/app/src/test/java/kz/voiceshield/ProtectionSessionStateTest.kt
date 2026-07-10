package kz.voiceshield

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProtectionSessionStateTest {
  @Test fun protectionIsOffByDefaultAndCanBeRevoked() {
    ProtectionSessionState.setActive(false)
    assertFalse(ProtectionSessionState.isActive())
    ProtectionSessionState.setActive(true)
    assertTrue(ProtectionSessionState.isActive())
    ProtectionSessionState.setActive(false)
    assertFalse(ProtectionSessionState.isActive())
  }
}
