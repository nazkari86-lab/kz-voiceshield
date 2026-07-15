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

  @Test fun acceptsOnlyCommitPinnedPublicGgufArtifacts() {
    val publicGguf = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/9217f5db79a29953eb74d5343926648285ec7e67/model-Q4_K_M.gguf?download=true"
    assertTrue(ModelDownloadPolicy.isApprovedPublicGguf(publicGguf))
    assertFalse(ModelDownloadPolicy.isApproved(publicGguf))
    assertFalse(ModelDownloadPolicy.isApprovedPublicGguf(publicGguf.replace("9217f5db79a29953eb74d5343926648285ec7e67", "main")))
    assertFalse(ModelDownloadPolicy.isApprovedPublicGguf(publicGguf.replace(".gguf", ".bin")))
    assertFalse(ModelDownloadPolicy.isApprovedPublicGguf(publicGguf.replace("huggingface.co", "huggingface.co.example.org")))
  }
}
