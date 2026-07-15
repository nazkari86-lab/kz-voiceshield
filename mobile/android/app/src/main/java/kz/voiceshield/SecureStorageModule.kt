package kz.voiceshield

import android.view.WindowManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.Executors

class SecureStorageModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = "SecureStorageModule"

  @ReactMethod
  fun getItem(key: String, promise: Promise) = runSecure(promise) {
    EncryptedLocalStore.get(context, key)
  }

  @ReactMethod
  fun setItem(key: String, value: String, promise: Promise) = runSecure(promise) {
    EncryptedLocalStore.put(context, key, value)
    true
  }

  @ReactMethod
  fun removeItem(key: String, promise: Promise) = runSecure(promise) {
    EncryptedLocalStore.remove(context, key)
    true
  }

  @ReactMethod
  fun clear(promise: Promise) = runSecure(promise) {
    EncryptedLocalStore.clear(context)
    true
  }

  @ReactMethod
  fun setScreenCaptureBlocked(blocked: Boolean, promise: Promise) {
    context.runOnUiQueueThread {
      try {
        val window = currentActivity?.window ?: error("No active Android window")
        if (blocked) {
          window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
          window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
        promise.resolve(true)
      } catch (error: Throwable) {
        promise.reject("SECURE_WINDOW_FAILED", error.message ?: "Could not update secure window", error)
      }
    }
  }

  private fun runSecure(promise: Promise, operation: () -> Any?) {
    executor.execute {
      try {
        promise.resolve(operation())
      } catch (error: Throwable) {
        promise.reject("SECURE_STORAGE_FAILED", error.message ?: "Secure storage failed", error)
      }
    }
  }

  override fun invalidate() {
    executor.shutdown()
    super.invalidate()
  }

}
