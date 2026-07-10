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
}
