package kz.voiceshield

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.Executors

class ApkInspectorModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var pendingPromise: Promise? = null
  private val executor = Executors.newSingleThreadExecutor()
  private val activityListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != REQUEST_INSPECT_APK) return
      val promise = pendingPromise ?: return
      pendingPromise = null
      if (resultCode != Activity.RESULT_OK || data?.data == null) {
        promise.reject("APK_INSPECTION_CANCELLED", "No APK was selected")
        return
      }
      inspect(data.data!!, promise)
    }
  }

  init { context.addActivityEventListener(activityListener) }
  override fun getName() = "ApkInspectorModule"

  @ReactMethod
  fun pickAndInspect(promise: Promise) {
    if (pendingPromise != null) { promise.reject("APK_INSPECTION_BUSY", "Another APK selection is already open"); return }
    val activity = currentActivity ?: run { promise.reject("ACTIVITY_UNAVAILABLE", "Open the application before selecting an APK"); return }
    pendingPromise = promise
    activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "application/vnd.android.package-archive"
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }, REQUEST_INSPECT_APK)
  }

  private fun inspect(uri: Uri, promise: Promise) = executor.execute {
    var copy: File? = null
    try {
      val name = displayName(uri) ?: "application.apk"
      copy = File.createTempFile("voiceshield-apk-", ".apk", context.cacheDir)
      var size = 0L
      val digest = MessageDigest.getInstance("SHA-256")
      context.contentResolver.openInputStream(uri)?.use { input ->
        FileOutputStream(copy).use { output ->
          val buffer = ByteArray(32 * 1024)
          while (true) {
            val read = input.read(buffer)
            if (read <= 0) break
            size += read
            if (size > MAX_APK_BYTES) throw IllegalArgumentException("APK is larger than 512 MB")
            digest.update(buffer, 0, read)
            output.write(buffer, 0, read)
          }
        }
      } ?: throw IllegalStateException("Could not open the APK")
      val inspectionFlags = PackageManager.GET_PERMISSIONS or PackageManager.GET_ACTIVITIES or PackageManager.GET_SERVICES or PackageManager.GET_RECEIVERS or signatureFlag()
      val flags = if (Build.VERSION.SDK_INT >= 33) PackageManager.PackageInfoFlags.of(inspectionFlags.toLong()) else null
      val archiveInfo = if (flags != null) context.packageManager.getPackageArchiveInfo(copy.absolutePath, flags) else @Suppress("DEPRECATION") context.packageManager.getPackageArchiveInfo(copy.absolutePath, inspectionFlags)
      val info = archiveInfo ?: throw IllegalArgumentException("Android could not read this APK")
      val result = Arguments.createMap().apply {
        putString("fileName", name)
        putString("packageName", info.packageName ?: "")
        putString("versionName", info.versionName ?: "unknown")
        putDouble("versionCode", if (Build.VERSION.SDK_INT >= 28) info.longVersionCode.toDouble() else @Suppress("DEPRECATION") info.versionCode.toDouble())
        putDouble("sizeBytes", size.toDouble())
        putString("sha256", digest.digest().joinToString("") { "%02x".format(it) })
        putInt("targetSdkVersion", info.applicationInfo?.targetSdkVersion ?: 0)
        putInt("minSdkVersion", if (Build.VERSION.SDK_INT >= 24) info.applicationInfo?.minSdkVersion ?: 0 else 0)
        putInt("activityCount", info.activities?.size ?: 0)
        putInt("serviceCount", info.services?.size ?: 0)
        putInt("receiverCount", info.receivers?.size ?: 0)
        val permissions = Arguments.createArray()
        (info.requestedPermissions ?: emptyArray()).sorted().forEach { permissions.pushString(it) }
        putArray("requestedPermissions", permissions)
        val signatures = Arguments.createArray()
        signatureDigests(info).forEach { signatures.pushString(it) }
        putArray("signingCertificateSha256", signatures)
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("APK_INSPECTION_FAILED", error.message ?: "Could not inspect this APK", error)
    } finally { copy?.delete() }
  }

  private fun displayName(uri: Uri): String? = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
    if (cursor.moveToFirst()) cursor.getString(cursor.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME)) else null
  }

  override fun invalidate() { context.removeActivityEventListener(activityListener); executor.shutdownNow(); super.invalidate() }

  private fun signatureFlag(): Int = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else @Suppress("DEPRECATION") PackageManager.GET_SIGNATURES

  private fun signatureDigests(info: android.content.pm.PackageInfo): List<String> {
    val signatures = if (Build.VERSION.SDK_INT >= 28) {
      val signingInfo = info.signingInfo ?: return emptyList()
      if (signingInfo.hasMultipleSigners()) signingInfo.apkContentsSigners else signingInfo.signingCertificateHistory
    } else {
      @Suppress("DEPRECATION") info.signatures
    } ?: return emptyList()
    return signatures.map { signature ->
      MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString("") { "%02x".format(it) }
    }.distinct().take(8)
  }

  companion object { const val REQUEST_INSPECT_APK = 4111; const val MAX_APK_BYTES = 512L * 1024 * 1024 }
}
