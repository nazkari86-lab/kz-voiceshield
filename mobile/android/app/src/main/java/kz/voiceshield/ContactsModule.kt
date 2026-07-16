package kz.voiceshield

import android.Manifest
import android.content.pm.PackageManager
import android.provider.ContactsContract
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ContactsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = "ContactsModule"

  @ReactMethod
  fun getContacts(limit: Int, promise: Promise) {
    if (context.checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("CONTACTS_PERMISSION_REQUIRED", "Contacts permission is required before importing a trusted contact")
      return
    }
    runCatching {
      val result = Arguments.createArray()
      val safeLimit = limit.coerceIn(1, 200)
      val projection = arrayOf(ContactsContract.CommonDataKinds.Phone.CONTACT_ID, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER)
      context.contentResolver.query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        projection,
        null,
        null,
        "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} COLLATE NOCASE ASC",
      )?.use { cursor ->
        val idIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID)
        val nameIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
        val phoneIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
        var count = 0
        while (cursor.moveToNext() && count < safeLimit) {
          val name = cursor.getString(nameIndex)?.trim().orEmpty()
          val phone = cursor.getString(phoneIndex)?.trim().orEmpty()
          if (name.isNotEmpty() && phone.isNotEmpty()) {
            result.pushMap(Arguments.createMap().apply {
              putString("id", cursor.getString(idIndex).orEmpty())
              putString("name", name.take(80))
              putString("phone", phone.take(32))
            })
            count++
          }
        }
      }
      result
    }.onSuccess(promise::resolve).onFailure { promise.reject("CONTACTS_READ_FAILED", it.message, it) }
  }
}
