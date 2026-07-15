package kz.voiceshield

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Shared AES-GCM storage used by both React Native and native call protection. */
object EncryptedLocalStore {
  private const val PREFERENCES = "voiceshield_secure_v1"
  private const val KEY_ALIAS = "kz.voiceshield.local-data.v1"
  private const val TRANSFORMATION = "AES/GCM/NoPadding"
  private const val MAX_VALUE_BYTES = 8 * 1024 * 1024

  fun get(context: Context, key: String): String? {
    validateKey(key)
    return preferences(context).getString(key, null)?.let(::decrypt)
  }

  fun put(context: Context, key: String, value: String) {
    validateKey(key)
    require(value.toByteArray().size <= MAX_VALUE_BYTES) { "Encrypted value exceeds the local storage limit" }
    check(preferences(context).edit().putString(key, encrypt(value)).commit()) { "Could not persist encrypted data" }
  }

  fun remove(context: Context, key: String) {
    validateKey(key)
    check(preferences(context).edit().remove(key).commit()) { "Could not remove encrypted data" }
  }

  fun clear(context: Context) {
    check(preferences(context).edit().clear().commit()) { "Could not clear encrypted data" }
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    if (keyStore.containsAlias(KEY_ALIAS)) keyStore.deleteEntry(KEY_ALIAS)
  }

  private fun preferences(context: Context) = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

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
    (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
      init(
        KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
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
}
