package kz.voiceshield

import android.app.Activity
import android.content.Intent
import android.database.Cursor
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Xml
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.xmlpull.v1.XmlPullParser
import java.io.ByteArrayOutputStream
import java.io.StringReader
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.zip.ZipInputStream

class ChatAttachmentModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var pendingPromise: Promise? = null
  private val readerExecutor = Executors.newSingleThreadExecutor()
  private val pickerListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != PICK_ATTACHMENT_REQUEST) return
      val promise = pendingPromise ?: return
      pendingPromise = null
      if (resultCode != Activity.RESULT_OK) {
        promise.reject("CHAT_ATTACHMENT_CANCELLED", "No file was selected")
        return
      }
      val uri = data?.data
      if (uri == null) {
        promise.reject("CHAT_ATTACHMENT_FAILED", "The selected file could not be opened")
        return
      }
      readAttachment(uri, data.flags, promise)
    }
  }

  init {
    context.addActivityEventListener(pickerListener)
  }

  override fun getName(): String = "ChatAttachmentModule"
  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun pickReadableAttachment(promise: Promise) {
    if (pendingPromise != null) {
      promise.reject("CHAT_ATTACHMENT_BUSY", "Another file selection is already open")
      return
    }
    val activity = currentActivity
    if (activity == null) {
      promise.reject("ACTIVITY_UNAVAILABLE", "Open the application before selecting a file")
      return
    }
    pendingPromise = promise
    activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
      type = "*/*"
      putExtra(Intent.EXTRA_MIME_TYPES, arrayOf(
        "text/*", "application/json", "application/csv", "text/csv", "image/*", "application/pdf", "application/zip", "application/x-zip-compressed",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ))
    }, PICK_ATTACHMENT_REQUEST)
  }

  @ReactMethod
  fun consumePendingSharedAttachment(promise: Promise) {
    val shared = pendingSharedAttachment
    pendingSharedAttachment = null
    if (shared == null) {
      promise.resolve(null)
      return
    }
    readAttachment(shared.uri, shared.flags, promise)
  }

  private fun readAttachment(uri: Uri, resultFlags: Int, promise: Promise) {
    try {
      context.contentResolver.takePersistableUriPermission(uri, resultFlags and Intent.FLAG_GRANT_READ_URI_PERMISSION)
    } catch (_: SecurityException) {
      // Some providers issue a temporary grant only; it remains valid for this read.
    }
    val fileName = displayName(uri) ?: "attachment"
    val mimeType = context.contentResolver.getType(uri).orEmpty()
    if (mimeType.startsWith("image/")) {
      readImageText(uri, fileName, mimeType, promise)
      return
    }
    readerExecutor.execute {
      try {
        val result = when {
          isPdf(mimeType, fileName) -> readPdfText(uri)
          isDocx(mimeType, fileName) -> readDocxText(uri)
          isZip(mimeType, fileName) -> readZipText(uri)
          isSupportedText(mimeType, fileName) -> readText(uri)
          else -> throw UnsupportedOperationException("Attach a text, CSV, JSON, DOCX, PDF, or image file.")
        }
        if (result.text.isEmpty()) throw IllegalStateException("This file does not contain readable text")
        promise.resolve(attachmentMap(fileName, mimeType.ifBlank { "text/plain" }, result, kindFor(mimeType, fileName), uri))
      } catch (error: UnsupportedOperationException) {
        promise.reject("CHAT_ATTACHMENT_UNSUPPORTED", error.message ?: "Unsupported file")
      } catch (error: Exception) {
        promise.reject("CHAT_ATTACHMENT_READ_FAILED", "Could not read this file", error)
      }
    }
  }

  private fun readImageText(uri: Uri, fileName: String, mimeType: String, promise: Promise) {
    readerExecutor.execute {
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      try {
        val image = InputImage.fromFilePath(context, uri)
        val mlText = Tasks.await(recognizer.process(image), 45, TimeUnit.SECONDS).text.trim()
        val cyrillicText = CyrillicOcr.recognize(context, uri)
        val text = CyrillicOcr.chooseBest(mlText, cyrillicText)
        if (text.isEmpty()) {
          promise.reject("CHAT_ATTACHMENT_EMPTY", "No readable text was found in this image")
        } else {
          promise.resolve(attachmentMap(fileName, mimeType, TextResult(text.take(MAX_TEXT_CHARS), text.length > MAX_TEXT_CHARS), "image", uri))
        }
      } catch (error: Exception) {
        promise.reject("CHAT_ATTACHMENT_READ_FAILED", "Could not read text from this image", error)
      } finally {
        recognizer.close()
      }
    }
  }

  private fun readPdfText(uri: Uri): TextResult {
    val descriptor = context.contentResolver.openFileDescriptor(uri, "r") ?: throw IllegalStateException("Could not open PDF")
    descriptor.use { file ->
      PdfRenderer(file).use { renderer ->
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        try {
          val parts = mutableListOf<String>()
          val pageCount = minOf(renderer.pageCount, MAX_PDF_PAGES)
          for (index in 0 until pageCount) {
            renderer.openPage(index).use { page ->
              val width = minOf(page.width, 1440)
              val height = (page.height.toLong() * width / page.width).toInt().coerceAtLeast(1)
              val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
              try {
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                val result = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)), 45, TimeUnit.SECONDS).text.trim()
                if (result.isNotEmpty()) parts += "[PDF page ${index + 1}]\n$result"
              } finally {
                bitmap.recycle()
              }
            }
          }
          val text = parts.joinToString("\n\n")
          return TextResult(text.take(MAX_TEXT_CHARS), renderer.pageCount > MAX_PDF_PAGES || text.length > MAX_TEXT_CHARS)
        } finally {
          recognizer.close()
        }
      }
    }
  }

  private fun readDocxText(uri: Uri): TextResult {
    val xml = context.contentResolver.openInputStream(uri)?.use { input ->
      ZipInputStream(input).use { zip ->
        var entry = zip.nextEntry
        while (entry != null) {
          if (entry.name == "word/document.xml") return@use readBounded(zip).toString(StandardCharsets.UTF_8)
          entry = zip.nextEntry
        }
        ""
      }
    } ?: throw IllegalStateException("Could not open DOCX")
    if (xml.isBlank()) throw IllegalStateException("This DOCX has no readable document text")
    val parser = Xml.newPullParser()
    parser.setInput(StringReader(xml))
    val output = StringBuilder()
    var event = parser.eventType
    while (event != XmlPullParser.END_DOCUMENT && output.length <= MAX_TEXT_CHARS) {
      when (event) {
        XmlPullParser.TEXT -> output.append(parser.text)
        XmlPullParser.END_TAG -> if (parser.name == "w:p" || parser.name == "w:br") output.append('\n')
      }
      event = parser.next()
    }
    val text = output.toString().replace(Regex("\\n{3,}"), "\n\n").trim()
    return TextResult(text.take(MAX_TEXT_CHARS), text.length > MAX_TEXT_CHARS)
  }

  private fun readZipText(uri: Uri): TextResult {
    val parts = mutableListOf<String>()
    var skipped = 0
    context.contentResolver.openInputStream(uri)?.use { input ->
      ZipInputStream(input).use { zip ->
        var entry = zip.nextEntry
        while (entry != null && parts.size < MAX_ARCHIVE_FILES) {
          val name = entry.name
          if (!entry.isDirectory && isSafeArchiveText(name)) {
            val bytes = readBounded(zip)
            val text = String(bytes.copyOf(minOf(bytes.size, MAX_ARCHIVE_FILE_CHARS)), StandardCharsets.UTF_8).trim()
            if (text.isNotEmpty()) parts += "[$name]\n$text"
          } else if (!entry.isDirectory) {
            skipped += 1
          }
          entry = zip.nextEntry
        }
      }
    } ?: throw IllegalStateException("Could not open ZIP")
    if (parts.isEmpty()) throw UnsupportedOperationException("ZIP must contain text, CSV, JSON, Markdown, log, XML, YAML, or HTML files.")
    val text = parts.joinToString("\n\n").take(MAX_TEXT_CHARS)
    return TextResult(text, skipped > 0 || parts.size >= MAX_ARCHIVE_FILES)
  }

  private fun readText(uri: Uri): TextResult {
    val bytes = context.contentResolver.openInputStream(uri)?.use { readBounded(it) } ?: throw IllegalStateException("Could not open file")
    val truncated = bytes.size > MAX_TEXT_CHARS
    val safeBytes = if (truncated) bytes.copyOf(MAX_TEXT_CHARS) else bytes
    return TextResult(String(safeBytes, StandardCharsets.UTF_8).trim(), truncated)
  }

  private fun readBounded(input: java.io.InputStream): ByteArray {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(8_192)
    var total = 0
    while (total <= MAX_TEXT_CHARS) {
      val read = input.read(buffer, 0, minOf(buffer.size, MAX_TEXT_CHARS + 1 - total))
      if (read <= 0) break
      output.write(buffer, 0, read)
      total += read
    }
    return output.toByteArray()
  }

  private fun attachmentMap(fileName: String, mimeType: String, result: TextResult, kind: String, uri: Uri) = Arguments.createMap().apply {
    putString("fileName", fileName)
    putString("mimeType", mimeType)
    putString("text", result.text)
    putBoolean("truncated", result.truncated)
    putString("kind", kind)
    putString("uri", uri.toString())
  }

  private fun displayName(uri: Uri): String? {
    var cursor: Cursor? = null
    return try {
      cursor = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
      if (cursor?.moveToFirst() == true) cursor.getString(cursor.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME)) else null
    } finally {
      cursor?.close()
    }
  }

  private fun isPdf(mimeType: String, fileName: String) = mimeType == "application/pdf" || fileName.lowercase().endsWith(".pdf")
  private fun isDocx(mimeType: String, fileName: String) = mimeType == DOCX_MIME || fileName.lowercase().endsWith(".docx")
  private fun isZip(mimeType: String, fileName: String) = mimeType == "application/zip" || mimeType == "application/x-zip-compressed" || fileName.lowercase().endsWith(".zip")
  private fun isSupportedText(mimeType: String, fileName: String): Boolean {
    if (mimeType.startsWith("text/") || mimeType == "application/json" || mimeType == "application/csv") return true
    return fileName.lowercase().endsWithAny(".txt", ".md", ".csv", ".json", ".log", ".xml", ".yaml", ".yml")
  }
  private fun kindFor(mimeType: String, fileName: String) = when {
    isPdf(mimeType, fileName) || isDocx(mimeType, fileName) -> "document"
    isZip(mimeType, fileName) -> "archive"
    else -> "text"
  }
  private fun isSafeArchiveText(name: String) = name.lowercase().endsWithAny(".txt", ".md", ".csv", ".json", ".log", ".xml", ".yaml", ".yml", ".html", ".htm")

  override fun invalidate() {
    context.removeActivityEventListener(pickerListener)
    readerExecutor.shutdownNow()
    pendingPromise?.reject("CHAT_ATTACHMENT_CANCELLED", "File selection was cancelled")
    pendingPromise = null
    super.invalidate()
  }

  private data class TextResult(val text: String, val truncated: Boolean)
  private data class PendingSharedAttachment(val uri: Uri, val flags: Int)

  companion object {
    const val PICK_ATTACHMENT_REQUEST = 4110
    const val MAX_TEXT_CHARS = 60_000
    const val MAX_PDF_PAGES = 8
    const val MAX_ARCHIVE_FILES = 8
    const val MAX_ARCHIVE_FILE_CHARS = 24_000
    const val DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    private var pendingSharedAttachment: PendingSharedAttachment? = null

    fun queueSharedAttachment(uri: Uri, flags: Int) {
      pendingSharedAttachment = PendingSharedAttachment(uri, flags)
    }
  }
}

private fun String.endsWithAny(vararg suffixes: String): Boolean = suffixes.any { endsWith(it) }
