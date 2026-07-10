package kz.voiceshield

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.net.URI
import java.security.MessageDigest

class ModelDownloader(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val client = OkHttpClient()
  override fun getName(): String = "ModelDownloader"

  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun hasModel(fileName: String, promise: Promise) {
    try {
      promise.resolve(modelFile(fileName).exists())
    } catch (error: Throwable) {
      promise.reject("MODEL_PATH_INVALID", error)
    }
  }

  @ReactMethod
  fun getVerifiedModelPath(fileName: String, expectedSha256: String, expectedSize: Double, promise: Promise) {
    Thread {
      try {
        validateExpectation(expectedSha256, expectedSize.toLong())
        val file = modelFile(fileName)
        if (!file.exists()) {
          promise.resolve(null)
        } else if (verify(file, expectedSha256, expectedSize.toLong())) {
          promise.resolve(file.absolutePath)
        } else {
          file.delete()
          promise.resolve(null)
        }
      } catch (error: Throwable) {
        promise.reject("MODEL_VERIFY_FAILED", error)
      }
    }.start()
  }

  @ReactMethod
  fun downloadModel(url: String, fileName: String, expectedSha256: String, expectedSize: Double, promise: Promise) {
    Thread {
      try {
        validateUrl(url)
        validateExpectation(expectedSha256, expectedSize.toLong())
        val file = modelFile(fileName)
        val tmp = File(file.absolutePath + ".tmp")
        tmp.delete()
        val digest = MessageDigest.getInstance("SHA-256")
        var totalBytes = 0L
        var lastProgress = -1
        client.newCall(Request.Builder().url(url).build()).execute().use { response ->
          if (!response.isSuccessful) error("Download failed: ${response.code}")
          val body = response.body ?: error("Download returned an empty body")
          body.byteStream().use { input ->
            FileOutputStream(tmp).use { output ->
              val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
              while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                totalBytes += read
                require(totalBytes <= expectedSize.toLong()) { "Model download exceeds expected size" }
                digest.update(buffer, 0, read)
                output.write(buffer, 0, read)
                val progress = ((totalBytes * 100L) / expectedSize.toLong()).toInt()
                if (progress != lastProgress) {
                  lastProgress = progress
                  val payload = Arguments.createMap().apply { putInt("progress", progress) }
                  AppRegistry.sendEvent("VS_MODEL_DOWNLOAD_PROGRESS", payload)
                }
              }
              output.fd.sync()
            }
          }
        }
        require(totalBytes == expectedSize.toLong()) { "Model size mismatch" }
        require(digest.digest().toHex() == expectedSha256.lowercase()) { "Model SHA-256 mismatch" }
        if (file.exists()) require(file.delete()) { "Could not replace the existing model" }
        if (!tmp.renameTo(file)) error("Could not finalize model file")
        promise.resolve(file.absolutePath)
      } catch (error: Throwable) {
        runCatching { modelFile(fileName + ".tmp").delete() }
        promise.reject("MODEL_DOWNLOAD_FAILED", error)
      }
    }.start()
  }

  @ReactMethod
  fun deleteModel(fileName: String, promise: Promise) {
    try {
      val file = modelFile(fileName)
      val deleted = !file.exists() || file.delete()
      File(file.absolutePath + ".tmp").delete()
      promise.resolve(deleted)
    } catch (error: Throwable) {
      promise.reject("MODEL_DELETE_FAILED", error)
    }
  }

  private fun modelFile(fileName: String): File {
    require(fileName.matches(Regex("[A-Za-z0-9._-]{1,120}"))) { "Invalid model file name" }
    val dir = File(context.filesDir, "models").also { it.mkdirs() }
    return File(dir, fileName)
  }

  private fun validateUrl(url: String) {
    val uri = URI(url)
    require(uri.scheme == "https") { "Model URL must use HTTPS" }
    require(uri.host == "huggingface.co") { "Model host is not allowed" }
    require(uri.path.startsWith("/ggerganov/whisper.cpp/resolve/")) { "Model path is not allowed" }
  }

  private fun validateExpectation(expectedSha256: String, expectedSize: Long) {
    require(expectedSha256.matches(Regex("[a-fA-F0-9]{64}"))) { "Invalid expected SHA-256" }
    require(expectedSize in 1..MAX_MODEL_BYTES) { "Invalid expected model size" }
  }

  private fun verify(file: File, expectedSha256: String, expectedSize: Long): Boolean {
    if (file.length() != expectedSize) return false
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
      while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        digest.update(buffer, 0, read)
      }
    }
    return digest.digest().toHex() == expectedSha256.lowercase()
  }

  private fun ByteArray.toHex(): String = joinToString("") { byte -> (byte.toInt() and 0xff).toString(16).padStart(2, '0') }

  companion object {
    private const val MAX_MODEL_BYTES = 700L * 1024L * 1024L
  }
}
