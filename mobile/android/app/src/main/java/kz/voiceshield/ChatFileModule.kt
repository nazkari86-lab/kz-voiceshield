package kz.voiceshield

import android.app.Activity
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.BufferedReader
import java.io.InputStreamReader

class ChatFileModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var pendingPromise: Promise? = null

  private val activityListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != REQUEST_CODE) return
      val promise = pendingPromise ?: return
      pendingPromise = null
      if (resultCode != Activity.RESULT_OK || data?.data == null) {
        promise.resolve(null)
        return
      }
      try {
        promise.resolve(readAttachment(data.data!!))
      } catch (error: Throwable) {
        promise.reject("CHAT_FILE_READ_FAILED", error.message ?: "Не удалось прочитать файл")
      }
    }
  }

  init { context.addActivityEventListener(activityListener) }

  override fun getName(): String = "ChatFileModule"

  @ReactMethod
  fun pickFile(promise: Promise) {
    if (pendingPromise != null) {
      promise.reject("CHAT_FILE_BUSY", "Выбор файла уже выполняется")
      return
    }
    val activity = currentActivity
    if (activity == null) {
      promise.reject("CHAT_FILE_NO_ACTIVITY", "Экран выбора файла недоступен")
      return
    }
    pendingPromise = promise
    try {
      activity.startActivityForResult(
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "*/*"
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        },
        REQUEST_CODE,
      )
    } catch (error: Throwable) {
      pendingPromise = null
      promise.reject("CHAT_FILE_PICKER_FAILED", error.message ?: "Не удалось открыть выбор файла")
    }
  }

  private fun readAttachment(uri: Uri) = Arguments.createMap().apply {
    val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
    val name = queryName(uri) ?: "attachment"
    val size = querySize(uri)
    putString("name", name)
    putString("mimeType", mime)
    putDouble("size", size.toDouble())
    when {
      isText(name, mime) -> putString("text", readText(uri))
      mime.startsWith("image/") && size in 1..MAX_IMAGE_BYTES -> {
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
          ?: error("Не удалось открыть изображение")
        putString("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
      }
      else -> putString("note", "Файл прикреплён, но его содержимое не извлекается на устройстве.")
    }
  }

  private fun readText(uri: Uri): String {
    val builder = StringBuilder()
    context.contentResolver.openInputStream(uri)?.use { stream ->
      BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).useLines { lines ->
        for (line in lines) {
          if (builder.length >= MAX_TEXT_CHARS) break
          builder.append(line).append('\n')
        }
      }
    } ?: error("Не удалось открыть текстовый файл")
    return builder.toString().take(MAX_TEXT_CHARS)
  }

  private fun queryName(uri: Uri): String? = query(uri, OpenableColumns.DISPLAY_NAME)
  private fun querySize(uri: Uri): Long = query(uri, OpenableColumns.SIZE)?.toLongOrNull() ?: 0L

  private fun query(uri: Uri, column: String): String? {
    val cursor: Cursor = context.contentResolver.query(uri, arrayOf(column), null, null, null) ?: return null
    return cursor.use { if (it.moveToFirst()) it.getString(0) else null }
  }

  private fun isText(name: String, mime: String): Boolean = mime.startsWith("text/") ||
    name.substringAfterLast('.', "").lowercase() in setOf("txt", "md", "csv", "json", "xml", "html", "log", "kt", "java", "ts", "tsx", "js", "py", "yaml", "yml")

  companion object {
    private const val REQUEST_CODE = 4192
    private const val MAX_TEXT_CHARS = 120_000
    private const val MAX_IMAGE_BYTES = 8L * 1024L * 1024L
  }
}
