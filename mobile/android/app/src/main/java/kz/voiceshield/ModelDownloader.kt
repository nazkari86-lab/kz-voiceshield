package kz.voiceshield

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
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
  private var importPromise: Promise? = null
  private var importFileName: String? = null
  private var importMinimumBytes = 0L
  private var importMaximumBytes = 0L

  private val importListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != IMPORT_MODEL_REQUEST) return
      val promise = importPromise ?: return
      importPromise = null
      if (resultCode != Activity.RESULT_OK || data?.data == null) {
        promise.reject("MODEL_IMPORT_CANCELLED", "No model file was selected")
        return
      }
      Thread {
        try {
          val destination = modelFile(requireNotNull(importFileName))
          val temporary = File(destination.absolutePath + ".tmp")
          temporary.delete()
          context.contentResolver.openInputStream(data.data!!).use { input ->
            requireNotNull(input) { "Could not open the selected model file" }
            FileOutputStream(temporary).use { output ->
              val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
              var total = 0L
              while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                require(total <= importMaximumBytes) { "Selected model exceeds the device limit" }
                output.write(buffer, 0, read)
              }
              output.fd.sync()
              require(total >= importMinimumBytes) { "Selected file is too small to be a valid model" }
            }
          }
          if (destination.exists()) require(destination.delete()) { "Could not replace the existing Gemma model" }
          require(temporary.renameTo(destination)) { "Could not finalize the imported Gemma model" }
          promise.resolve(destination.absolutePath)
        } catch (error: Throwable) {
          runCatching { modelFile(GEMMA_MODEL_FILE + ".tmp").delete() }
          promise.reject("MODEL_IMPORT_FAILED", error)
        } finally {
          importFileName = null
        }
      }.start()
    }
  }

  init { context.addActivityEventListener(importListener) }
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

  @ReactMethod
  fun getModelPath(fileName: String, promise: Promise) {
    try {
      val file = modelFile(fileName)
      promise.resolve(if (file.exists()) file.absolutePath else null)
    } catch (error: Throwable) {
      promise.reject("MODEL_PATH_INVALID", error)
    }
  }

  @ReactMethod
  fun importGemmaModel(promise: Promise) {
    beginImport(GEMMA_MODEL_FILE, MIN_GEMMA_BYTES, MAX_MODEL_BYTES, promise)
  }

  @ReactMethod
  fun importWhisperSmallModel(promise: Promise) {
    beginImport(WHISPER_SMALL_FILE, WHISPER_SMALL_BYTES, WHISPER_SMALL_BYTES, promise)
  }

  private fun beginImport(fileName: String, minimumBytes: Long, maximumBytes: Long, promise: Promise) {
    if (importPromise != null) {
      promise.reject("MODEL_IMPORT_BUSY", "Another model import is already running")
      return
    }
    val activity = currentActivity
    if (activity == null) {
      promise.reject("ACTIVITY_UNAVAILABLE", "Open the application before selecting a model file")
      return
    }
    importPromise = promise
    importFileName = fileName
    importMinimumBytes = minimumBytes
    importMaximumBytes = maximumBytes
    activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "application/octet-stream"
      putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/octet-stream", "application/x-tflite", "*/*"))
    }, IMPORT_MODEL_REQUEST)
  }

  override fun invalidate() {
    importPromise?.reject("MODEL_IMPORT_CANCELLED", "Model import was cancelled")
    importPromise = null
    context.removeActivityEventListener(importListener)
    super.invalidate()
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
    private const val IMPORT_MODEL_REQUEST = 4110
    private const val GEMMA_MODEL_FILE = "gemma-3-1b-it-int4.task"
    private const val MIN_GEMMA_BYTES = 300L * 1024L * 1024L
    private const val MAX_MODEL_BYTES = 700L * 1024L * 1024L
    private const val WHISPER_SMALL_FILE = "ggml-small.bin"
    private const val WHISPER_SMALL_BYTES = 487601967L
  }
}
