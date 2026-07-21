package kz.voiceshield

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

/** Copies bundled evidence models once and refuses corrupted assets. */
object VoiceModelAssets {
  fun copyVerified(
    context: Context,
    assetName: String,
    targetName: String,
    expectedBytes: Long,
    expectedSha256: String,
  ): String {
    val modelsDir = File(context.filesDir, "models").apply { mkdirs() }
    val target = File(modelsDir, targetName)
    if (isValid(target, expectedBytes, expectedSha256)) return target.absolutePath

    val partial = File(modelsDir, "$targetName.part")
    if (partial.exists()) partial.delete()
    context.assets.open(assetName).use { input ->
      FileOutputStream(partial).use { output -> input.copyTo(output) }
    }
    check(isValid(partial, expectedBytes, expectedSha256)) { "Bundled model checksum mismatch: $assetName" }
    check(partial.renameTo(target)) { "Unable to activate bundled model: $targetName" }
    return target.absolutePath
  }

  private fun isValid(file: File, expectedBytes: Long, expectedSha256: String): Boolean {
    if (!file.isFile || file.length() != expectedBytes) return false
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
      while (true) {
        val read = input.read(buffer)
        if (read <= 0) break
        digest.update(buffer, 0, read)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }.equals(expectedSha256, ignoreCase = true)
  }
}
