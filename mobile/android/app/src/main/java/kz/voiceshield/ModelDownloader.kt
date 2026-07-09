package kz.voiceshield

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File

class ModelDownloader(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val client = OkHttpClient()
  override fun getName(): String = "ModelDownloader"

  @ReactMethod
  fun hasModel(fileName: String, promise: Promise) {
    promise.resolve(modelFile(fileName).exists())
  }

  @ReactMethod
  fun getModelPath(fileName: String, promise: Promise) {
    val file = modelFile(fileName)
    promise.resolve(if (file.exists()) file.absolutePath else null)
  }

  @ReactMethod
  fun downloadModel(url: String, fileName: String, promise: Promise) {
    Thread {
      try {
        val file = modelFile(fileName)
        val tmp = File(file.absolutePath + ".tmp")
        client.newCall(Request.Builder().url(url).build()).execute().use { response ->
          if (!response.isSuccessful) error("Download failed: ${response.code}")
          response.body?.byteStream()?.use { input -> tmp.outputStream().use { output -> input.copyTo(output) } }
        }
        if (!tmp.renameTo(file)) error("Could not finalize model file")
        promise.resolve(file.absolutePath)
      } catch (error: Throwable) {
        promise.reject("MODEL_DOWNLOAD_FAILED", error)
      }
    }.start()
  }

  private fun modelFile(fileName: String): File {
    val dir = File(context.filesDir, "models").also { it.mkdirs() }
    return File(dir, fileName)
  }
}
