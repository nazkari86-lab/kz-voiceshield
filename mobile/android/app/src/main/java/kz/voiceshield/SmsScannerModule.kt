package kz.voiceshield

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

data class SmsMessage(val id: String, val address: String, val body: String, val date: Long, val type: Int)

class SmsScannerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "SmsScannerModule"

  @ReactMethod
  fun hasPermission(promise: Promise) {
    val granted = ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
    promise.resolve(granted)
  }

  @ReactMethod
  fun getRecentMessages(limit: Int, promise: Promise) {
    if (ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("NO_PERMISSION", "READ_SMS permission not granted")
      return
    }
    try {
      val safeLimit = limit.coerceIn(1, 50)
      val cursor = reactApplicationContext.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("_id", "address", "body", "date", "type"),
        null, null,
        "date DESC LIMIT $safeLimit",
      )
      val result = Arguments.createArray()
      cursor?.use {
        val idCol = it.getColumnIndex("_id")
        val addrCol = it.getColumnIndex("address")
        val bodyCol = it.getColumnIndex("body")
        val dateCol = it.getColumnIndex("date")
        while (it.moveToNext()) {
          val map = Arguments.createMap()
          map.putString("id", it.getString(idCol))
          map.putString("address", it.getString(addrCol) ?: "")
          map.putString("body", it.getString(bodyCol) ?: "")
          map.putDouble("date", it.getLong(dateCol).toDouble())
          result.pushMap(map)
        }
      }
      promise.resolve(result)
    } catch (e: Throwable) {
      promise.reject("SMS_READ_ERROR", e)
    }
  }
}
