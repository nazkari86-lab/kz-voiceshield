package kz.voiceshield

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelDownloadPolicyTest {
  private val gemmaUrl =
    "https://github.com/nazkari86-lab/kz-voiceshield/releases/download/gemma-v1.0.0/gemma3-1b-it-int4.task"

  @Test fun acceptsPublishedGemmaArtifact() {
    assertTrue(ModelDownloadPolicy.isApproved(gemmaUrl))
  }

  @Test fun rejectsLocalGemmaFileNameAsReleaseArtifact() {
    assertFalse(ModelDownloadPolicy.isApproved(gemmaUrl.replace("gemma3-", "gemma-3-")))
  }

  @Test fun rejectsInsecureOrLookalikeGemmaUrls() {
    assertFalse(ModelDownloadPolicy.isApproved(gemmaUrl.replace("https://", "http://")))
    assertFalse(ModelDownloadPolicy.isApproved(gemmaUrl.replace("github.com", "github.com.example.org")))
  }
}
