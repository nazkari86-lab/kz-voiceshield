package kz.voiceshield

import android.app.Activity
import android.content.Intent
import android.app.ActivityManager
import android.os.StatFs
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
  private var importExpectedSha256: String? = null

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
        val selectedFileName = importFileName
        try {
          val destination = modelFile(requireNotNull(selectedFileName))
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
          importExpectedSha256?.let { expected ->
            require(verify(temporary, expected, importMinimumBytes)) { "Selected model SHA-256 does not match the verified FastConformer release" }
          }
          if (destination.exists()) require(destination.delete()) { "Could not replace the existing model" }
          require(temporary.renameTo(destination)) { "Could not finalize the imported model" }
          promise.resolve(destination.absolutePath)
        } catch (error: Throwable) {
          selectedFileName?.let { fileName -> runCatching { modelFile(fileName + ".tmp").delete() } }
          promise.reject("MODEL_IMPORT_FAILED", error)
        } finally {
          importFileName = null
          importExpectedSha256 = null
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
          if (fileName == FASTCONFORMER_MODEL_FILE) ensureFastConformerTokens()
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
        requireFreeSpace(expectedSize.toLong())
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
  fun getStorageInfo(promise: Promise) {
    try {
      val stat = StatFs(context.filesDir.absolutePath)
      val memory = context.getSystemService(ActivityManager::class.java).let { manager ->
        ActivityManager.MemoryInfo().also(manager::getMemoryInfo)
      }
      promise.resolve(Arguments.createMap().apply {
        putDouble("availableBytes", stat.availableBytes.toDouble())
        putDouble("totalBytes", stat.totalBytes.toDouble())
        putDouble("ramBytes", memory.totalMem.toDouble())
      })
    } catch (error: Throwable) {
      promise.reject("MODEL_STORAGE_INFO_FAILED", error)
    }
  }

  @ReactMethod
  fun setActiveWhisperModel(fileName: String, promise: Promise) {
    try {
      require(fileName.startsWith("ggml-") && fileName.endsWith(".bin") || fileName == FASTCONFORMER_MODEL_FILE) { "Invalid speech model file" }
      context.getSharedPreferences(PREFS_NAME, 0).edit().putString(ACTIVE_WHISPER_MODEL, fileName).apply()
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("MODEL_SELECTION_FAILED", error)
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

  @ReactMethod
  fun importFastConformerModel(promise: Promise) {
    beginImport(FASTCONFORMER_MODEL_FILE, FASTCONFORMER_MODEL_BYTES, FASTCONFORMER_MODEL_BYTES, promise, FASTCONFORMER_MODEL_SHA256)
  }

  private fun beginImport(fileName: String, minimumBytes: Long, maximumBytes: Long, promise: Promise, expectedSha256: String? = null) {
    if (importPromise != null) {
      promise.reject("MODEL_IMPORT_BUSY", "Another model import is already running")
      return
    }
    val activity = currentActivity
    if (activity == null) {
      promise.reject("ACTIVITY_UNAVAILABLE", "Open the application before selecting a model file")
      return
    }
    try {
      requireFreeSpace(minimumBytes)
    } catch (error: Throwable) {
      promise.reject("MODEL_IMPORT_STORAGE", error)
      return
    }
    importPromise = promise
    importFileName = fileName
    importMinimumBytes = minimumBytes
    importMaximumBytes = maximumBytes
    importExpectedSha256 = expectedSha256
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

  fun ensureFastConformerTokens(): File {
    val destination = modelFile(FASTCONFORMER_TOKENS_FILE)
    if (destination.isFile && destination.length() == FASTCONFORMER_TOKENS_BYTES && verify(destination, FASTCONFORMER_TOKENS_SHA256, FASTCONFORMER_TOKENS_BYTES)) return destination
    val temporary = File(destination.absolutePath + ".tmp")
    temporary.delete()
    context.assets.open(FASTCONFORMER_TOKENS_FILE).use { input ->
      FileOutputStream(temporary).use { output -> input.copyTo(output); output.fd.sync() }
    }
    require(verify(temporary, FASTCONFORMER_TOKENS_SHA256, FASTCONFORMER_TOKENS_BYTES)) { "Bundled FastConformer vocabulary is invalid" }
    if (destination.exists()) require(destination.delete()) { "Could not replace FastConformer vocabulary" }
    require(temporary.renameTo(destination)) { "Could not finalize FastConformer vocabulary" }
    return destination
  }

  private fun validateUrl(url: String) {
    val uri = URI(url)
    require(uri.scheme == "https") { "Model URL must use HTTPS" }
    val isWhisperRelease = uri.host == "huggingface.co" && uri.path.startsWith("/ggerganov/whisper.cpp/resolve/")
    val isFastConformerRelease = uri.host == "github.com" && uri.path == "/nazkari86-lab/kz-voiceshield/releases/download/fastconformer-v1.1.0/$FASTCONFORMER_MODEL_FILE"
    require(isWhisperRelease || isFastConformerRelease) { "Model URL is not an approved release artifact" }
  }

  private fun validateExpectation(expectedSha256: String, expectedSize: Long) {
    require(expectedSha256.matches(Regex("[a-fA-F0-9]{64}"))) { "Invalid expected SHA-256" }
    require(expectedSize in 1..MAX_MODEL_BYTES) { "Invalid expected model size" }
  }

  private fun requireFreeSpace(modelBytes: Long) {
    val available = StatFs(context.filesDir.absolutePath).availableBytes
    // The downloader writes to a temporary file before atomically renaming it.
    val required = modelBytes * 2 + STORAGE_RESERVE_BYTES
    require(available >= required) {
      "Not enough free storage. Need ${required / 1024 / 1024} MB, available ${available / 1024 / 1024} MB"
    }
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
    private const val MAX_MODEL_BYTES = 2L * 1024L * 1024L * 1024L
    private const val STORAGE_RESERVE_BYTES = 256L * 1024L * 1024L
    const val PREFS_NAME = "voice_shield_models"
    const val ACTIVE_WHISPER_MODEL = "active_whisper_model"
    private const val WHISPER_SMALL_FILE = "ggml-small.bin"
    private const val WHISPER_SMALL_BYTES = 487601967L
    const val FASTCONFORMER_MODEL_FILE = "fastconformer-kk-ru-int8.onnx"
    const val FASTCONFORMER_TOKENS_FILE = "fastconformer-kk-ru-tokens.txt"
    const val FASTCONFORMER_MODEL_BYTES = 131741652L
    private const val FASTCONFORMER_MODEL_SHA256 = "63c132a4246dc422ce23a3bb06812b86d95bc8b07592d0d17f8c3031f858b281"
    private const val FASTCONFORMER_TOKENS_BYTES = 15366L
    private const val FASTCONFORMER_TOKENS_SHA256 = "d296e1a77da9cfd3934dff6bd496b4e5f03850c18a9c528ada96fc749b2b3599"
  }
}
