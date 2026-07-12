package kz.voiceshield

import android.app.Activity
import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

class ImageScanModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var pendingPromise: Promise? = null
  private val pickerListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != PICK_IMAGE_REQUEST) return
      val promise = pendingPromise ?: return
      pendingPromise = null
      if (resultCode != Activity.RESULT_OK) {
        promise.reject("IMAGE_PICK_CANCELLED", "No image was selected")
        return
      }
      val uri = data?.data
      if (uri == null) {
        promise.reject("IMAGE_PICK_FAILED", "The selected image could not be opened")
        return
      }
      scan(uri, promise)
    }
  }

  init {
    context.addActivityEventListener(pickerListener)
  }

  override fun getName(): String = "ImageScanModule"
  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun pickImageAndScan(promise: Promise) {
    if (pendingPromise != null) {
      promise.reject("IMAGE_SCAN_BUSY", "An image scan is already running")
      return
    }
    val activity = currentActivity
    if (activity == null) {
      promise.reject("ACTIVITY_UNAVAILABLE", "Open the application before selecting an image")
      return
    }
    pendingPromise = promise
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "image/*"
    }
    activity.startActivityForResult(intent, PICK_IMAGE_REQUEST)
  }

  private fun scan(uri: Uri, promise: Promise) {
    val image = try {
      InputImage.fromFilePath(context, uri)
    } catch (error: Exception) {
      promise.reject("IMAGE_READ_FAILED", "Could not read this image", error)
      return
    }
    val options = BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
    val barcodeScanner = BarcodeScanning.getClient(options)
    val textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    barcodeScanner.process(image)
      .continueWithTask { barcodeTask ->
        val codes = barcodeTask.result.orEmpty().mapNotNull { it.rawValue }
        textRecognizer.process(image).continueWith { textTask ->
          val result = Arguments.createMap()
          result.putString("text", textTask.result?.text.orEmpty())
          val values = Arguments.createArray()
          codes.forEach { values.pushString(it) }
          result.putArray("qrValues", values)
          result
        }
      }
      .addOnSuccessListener { result -> promise.resolve(result) }
      .addOnFailureListener { error -> promise.reject("IMAGE_SCAN_FAILED", "Could not scan this image", error) }
      .addOnCompleteListener {
        barcodeScanner.close()
        textRecognizer.close()
      }
  }

  override fun invalidate() {
    context.removeActivityEventListener(pickerListener)
    pendingPromise?.reject("IMAGE_SCAN_CANCELLED", "Image scan was cancelled")
    pendingPromise = null
    super.invalidate()
  }

  private companion object {
    const val PICK_IMAGE_REQUEST = 4107
  }
}
