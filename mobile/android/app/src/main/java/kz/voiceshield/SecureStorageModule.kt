package kz.voiceshield

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyStore
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureStorageModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val preferences by lazy { context.getSharedPreferences("voiceshield_secure_v1", Context.MODE_PRIVATE) }
  private val keyAlias = "kz.voiceshield.local-data.v1"
  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = "SecureStorageModule"

  @ReactMethod
  fun getItem(key: String, promise: Promise) = runSecure(promise) {
    validateKey(key)
    preferences.getString(key, null)?.let(::decrypt)
  }

  @ReactMethod
  fun setItem(key: String, value: String, promise: Promise) = runSecure(promise) {
    validateKey(key)
    require(value.toByteArray().size <= MAX_VALUE_BYTES) { "Encrypted value exceeds the local storage limit" }
    check(preferences.edit().putString(key, encrypt(value)).commit()) { "Could not persist encrypted data" }
    true
  }

  @ReactMethod
  fun removeItem(key: String, promise: Promise) = runSecure(promise) {
    validateKey(key)
    check(preferences.edit().remove(key).commit()) { "Could not remove encrypted data" }
    true
  }

  @ReactMethod
  fun clear(promise: Promise) = runSecure(promise) {
    check(preferences.edit().clear().commit()) { "Could not clear encrypted data" }
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    if (keyStore.containsAlias(keyAlias)) keyStore.deleteEntry(keyAlias)
    true
  }

  private fun encrypt(value: String): String {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
    val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
    return "${Base64.encodeToString(cipher.iv, Base64.NO_WRAP)}.${Base64.encodeToString(encrypted, Base64.NO_WRAP)}"
  }

  private fun decrypt(value: String): String {
    val parts = value.split('.', limit = 2)
    require(parts.size == 2) { "Encrypted value has an invalid format" }
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
    return String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8)
  }

  private fun getOrCreateKey(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey(keyAlias, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
      init(
        KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .setRandomizedEncryptionRequired(true)
          .build(),
      )
      generateKey()
    }
  }

  private fun validateKey(key: String) {
    require(key.matches(Regex("[A-Za-z0-9._-]{1,120}"))) { "Invalid secure storage key" }
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

  companion object {
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val MAX_VALUE_BYTES = 8 * 1024 * 1024
  }
}
