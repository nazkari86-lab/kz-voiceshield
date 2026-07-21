package kz.voiceshield

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.googlecode.tesseract.android.TessBaseAPI
import java.io.File
import java.io.FileOutputStream

/** Offline Cyrillic OCR fallback used by chat attachments. */
object CyrillicOcr {
  fun chooseBest(mlText: String, cyrillicText: String): String {
    if (mlText.isBlank()) return cyrillicText.trim()
    if (cyrillicText.isBlank()) return mlText.trim()
    return if (score(cyrillicText) > score(mlText)) cyrillicText.trim() else mlText.trim()
  }

  fun recognize(context: Context, uri: Uri): String {
    val bitmap = decodeBitmap(context, uri) ?: return ""
    return try {
      recognize(context, bitmap)
    } finally {
      bitmap.recycle()
    }
  }

  fun recognize(context: Context, bitmap: Bitmap): String {
    val dataPath = ensureData(context)
    val tess = TessBaseAPI()
    return try {
      if (!tess.init(dataPath, "rus+kaz")) return ""
      tess.setImage(bitmap)
      tess.getUTF8Text()?.trim().orEmpty()
    } finally {
      tess.recycle()
    }
  }

  private fun ensureData(context: Context): String {
    val root = File(context.filesDir, "tesseract")
    val tessdata = File(root, "tessdata").apply { mkdirs() }
    listOf("rus.traineddata", "kaz.traineddata").forEach { name ->
      val target = File(tessdata, name)
      if (!target.isFile || target.length() == 0L) {
        context.assets.open("tessdata/$name").use { input ->
          FileOutputStream(target).use { output -> input.copyTo(output) }
        }
      }
    }
    return root.absolutePath
  }

  private fun decodeBitmap(context: Context, uri: Uri): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (maxOf(bounds.outWidth / sample, bounds.outHeight / sample) > MAX_DIMENSION) sample *= 2
    val options = BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 }
    return context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
  }

  private fun score(text: String): Int {
    val letters = text.count { it.isLetterOrDigit() }
    val cyrillic = text.count { it in '\u0400'..'\u052F' }
    val replacement = text.count { it == '\uFFFD' }
    return letters + cyrillic * 2 - replacement * 10
  }

  private const val MAX_DIMENSION = 2400
}
