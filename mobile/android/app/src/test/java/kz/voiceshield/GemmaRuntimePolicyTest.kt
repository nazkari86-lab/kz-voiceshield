package kz.voiceshield

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class GemmaRuntimePolicyTest {
  @Test
  fun usesContextEmbeddedInTheReleasedModel() {
    assertEquals(2048, GemmaRuntimePolicy.CONTEXT_TOKENS)
  }

  @Test
  fun rejectsDevicesBelowThreeGigabytes() {
    assertNotNull(GemmaRuntimePolicy.unsupportedReason(2L * 1024L * 1024L * 1024L))
  }

  @Test
  fun acceptsSupportedAndUnknownMemoryReadings() {
    assertNull(GemmaRuntimePolicy.unsupportedReason(8L * 1024L * 1024L * 1024L))
    assertNull(GemmaRuntimePolicy.unsupportedReason(0L))
  }
}
