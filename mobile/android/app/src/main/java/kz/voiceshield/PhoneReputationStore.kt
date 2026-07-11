package kz.voiceshield

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.telephony.PhoneNumberUtils
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.time.LocalTime
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey

data class PhoneProtectionConfig(
  val enabled: Boolean = false,
  val autoBlockCritical: Boolean = false,
  val blockHidden: Boolean = false,
  val blockInternational: Boolean = false,
  val blockRepeated: Boolean = true,
  val blockUnknownAtNight: Boolean = false,
  val nightStartHour: Int = 22,
  val nightEndHour: Int = 7,
)

data class PhoneAssessment(
  val numberKey: String,
  val maskedNumber: String,
  val result: PhoneRiskResult,
  val complaintCount: Int,
  val lastComplaintAt: Long,
) {
  fun toWritableMap(): WritableMap = Arguments.createMap().apply {
    putString("numberKey", numberKey)
    putString("maskedNumber", maskedNumber)
    putInt("score", result.score)
    putInt("trustRating", result.trustRating)
    putString("category", result.category)
    putString("action", result.action)
    putInt("complaintCount", complaintCount)
    putDouble("lastComplaintAt", lastComplaintAt.toDouble())
    putArray("reasons", Arguments.fromList(result.reasons))
  }
}

object PhoneReputationStore {
  private const val PREFS = "voiceshield_phone_reputation_v1"
  private const val HMAC_ALIAS = "voiceshield_phone_hmac_v1"
  private const val WINDOW_MS = 10 * 60 * 1000L
  private const val MAX_HISTORY_AGE_MS = 24 * 60 * 60 * 1000L

  private fun preferences(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun normalize(number: String?): String = PhoneNumberUtils.normalizeNumber(number.orEmpty())

  private fun hmacKey(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey(HMAC_ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(HMAC_ALIAS, KeyProperties.PURPOSE_SIGN)
        .setDigests(KeyProperties.DIGEST_SHA256)
        .build(),
    )
    return generator.generateKey()
  }

  private fun fingerprint(number: String?): String {
    val normalized = normalize(number)
    if (normalized.isEmpty()) return "hidden"
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(hmacKey())
    return Base64.encodeToString(mac.doFinal(normalized.toByteArray()), Base64.NO_WRAP or Base64.URL_SAFE).take(24)
  }

  private fun mask(number: String?): String {
    val normalized = normalize(number)
    return if (normalized.isEmpty()) "Hidden number" else "•••${normalized.takeLast(4)}"
  }

  fun config(context: Context): PhoneProtectionConfig {
    val prefs = preferences(context)
    return PhoneProtectionConfig(
      enabled = prefs.getBoolean("enabled", false),
      autoBlockCritical = prefs.getBoolean("autoBlockCritical", false),
      blockHidden = prefs.getBoolean("blockHidden", false),
      blockInternational = prefs.getBoolean("blockInternational", false),
      blockRepeated = prefs.getBoolean("blockRepeated", true),
      blockUnknownAtNight = prefs.getBoolean("blockUnknownAtNight", false),
      nightStartHour = prefs.getInt("nightStartHour", 22).coerceIn(0, 23),
      nightEndHour = prefs.getInt("nightEndHour", 7).coerceIn(0, 23),
    )
  }

  fun updateConfig(context: Context, values: Map<String, Any?>): PhoneProtectionConfig {
    val editor = preferences(context).edit()
    listOf("enabled", "autoBlockCritical", "blockHidden", "blockInternational", "blockRepeated", "blockUnknownAtNight").forEach { key ->
      (values[key] as? Boolean)?.let { editor.putBoolean(key, it) }
    }
    (values["nightStartHour"] as? Number)?.toInt()?.coerceIn(0, 23)?.let { editor.putInt("nightStartHour", it) }
    (values["nightEndHour"] as? Number)?.toInt()?.coerceIn(0, 23)?.let { editor.putInt("nightEndHour", it) }
    editor.apply()
    return config(context)
  }

  @Synchronized
  fun assess(context: Context, number: String?, verificationStatus: String, recordCall: Boolean): PhoneAssessment {
    val prefs = preferences(context)
    val key = fingerprint(number)
    val now = System.currentTimeMillis()
    val complaints = JSONObject(prefs.getString("complaints", "{}") ?: "{}")
    val complaint = complaints.optJSONObject(key)
    val storedHistory = JSONObject(prefs.getString("history", "{}") ?: "{}")
    val history = JSONObject()
    val storedKeys = storedHistory.keys()
    while (storedKeys.hasNext()) {
      val storedKey = storedKeys.next()
      val values = storedHistory.optJSONArray(storedKey) ?: continue
      val pruned = (0 until values.length())
        .map { values.optLong(it) }
        .filter { it > now - MAX_HISTORY_AGE_MS }
        .takeLast(100)
      if (pruned.isNotEmpty()) history.put(storedKey, JSONArray(pruned))
    }
    val timestamps = history.optJSONArray(key) ?: JSONArray()
    val recent = mutableListOf<Long>()
    for (index in 0 until timestamps.length()) {
      val timestamp = timestamps.optLong(index)
      if (timestamp > now - MAX_HISTORY_AGE_MS) recent += timestamp
    }
    if (recordCall) recent += now
    history.put(key, JSONArray(recent))
    if (recordCall) prefs.edit().putString("history", history.toString()).apply()
    var distinctRecentCallers = 0
    val historyKeys = history.keys()
    while (historyKeys.hasNext()) {
      val historyKey = historyKeys.next()
      val values = history.optJSONArray(historyKey) ?: continue
      if ((0 until values.length()).any { values.optLong(it) > now - WINDOW_MS }) distinctRecentCallers += 1
    }

    val trusted = prefs.getStringSet("trusted", emptySet()).orEmpty().contains(key)
    val blocked = prefs.getStringSet("blocked", emptySet()).orEmpty().contains(key)
    val normalized = normalize(number)
    val cfg = config(context)
    val hour = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) LocalTime.now().hour else 12
    val quietHours = if (cfg.nightStartHour > cfg.nightEndHour) hour >= cfg.nightStartHour || hour < cfg.nightEndHour
      else hour in cfg.nightStartHour until cfg.nightEndHour
    val result = PhoneReputationPolicy.evaluate(
      PhoneRiskInput(
        verificationStatus = verificationStatus,
        trusted = trusted,
        blocked = blocked,
        hidden = normalized.isEmpty(),
        international = normalized.startsWith("+") && !normalized.startsWith("+7"),
        complaintCount = complaint?.optInt("count", 0) ?: 0,
        recentCallCount = recent.count { it > now - WINDOW_MS },
        distinctRecentCallers = distinctRecentCallers,
        quietHours = quietHours,
        blockHidden = cfg.blockHidden,
        blockInternational = cfg.blockInternational,
        blockRepeated = cfg.blockRepeated,
        blockUnknownAtNight = cfg.blockUnknownAtNight,
        autoBlockCritical = cfg.autoBlockCritical,
      ),
    )
    return PhoneAssessment(key, mask(number), result, complaint?.optInt("count", 0) ?: 0, complaint?.optLong("lastAt", 0) ?: 0)
  }

  @Synchronized
  fun setDisposition(context: Context, number: String, disposition: String) {
    val key = fingerprint(number)
    require(key != "hidden") { "Enter a visible phone number" }
    val prefs = preferences(context)
    val trusted = prefs.getStringSet("trusted", emptySet()).orEmpty().toMutableSet()
    val blocked = prefs.getStringSet("blocked", emptySet()).orEmpty().toMutableSet()
    trusted.remove(key)
    blocked.remove(key)
    when (disposition) {
      "trusted" -> trusted += key
      "blocked" -> blocked += key
      "neutral" -> Unit
      else -> throw IllegalArgumentException("Unsupported disposition")
    }
    prefs.edit().putStringSet("trusted", trusted).putStringSet("blocked", blocked).apply()
  }

  @Synchronized
  fun report(context: Context, number: String, category: String): PhoneAssessment {
    val key = fingerprint(number)
    require(key != "hidden") { "Enter a visible phone number" }
    val prefs = preferences(context)
    val complaints = JSONObject(prefs.getString("complaints", "{}") ?: "{}")
    val current = complaints.optJSONObject(key) ?: JSONObject()
    current.put("count", current.optInt("count", 0) + 1)
    current.put("category", category.take(40))
    current.put("lastAt", System.currentTimeMillis())
    complaints.put(key, current)
    prefs.edit().putString("complaints", complaints.toString()).apply()
    return assess(context, number, "unverified", false)
  }

  fun exportData(context: Context): String {
    val prefs = preferences(context)
    return JSONObject().apply {
      put("schemaVersion", "voiceshield.phone-rules.v1")
      put("exportedAt", System.currentTimeMillis())
      put("config", JSONObject().apply {
        val cfg = config(context)
        put("enabled", cfg.enabled)
        put("autoBlockCritical", cfg.autoBlockCritical)
        put("blockHidden", cfg.blockHidden)
        put("blockInternational", cfg.blockInternational)
        put("blockRepeated", cfg.blockRepeated)
        put("blockUnknownAtNight", cfg.blockUnknownAtNight)
        put("nightStartHour", cfg.nightStartHour)
        put("nightEndHour", cfg.nightEndHour)
      })
      put("trusted", JSONArray(prefs.getStringSet("trusted", emptySet()).orEmpty().toList()))
      put("blocked", JSONArray(prefs.getStringSet("blocked", emptySet()).orEmpty().toList()))
      put("complaints", JSONObject(prefs.getString("complaints", "{}") ?: "{}"))
      put("privacy", "Contains device-bound HMAC identifiers, never raw phone numbers")
    }.toString(2)
  }

  fun importData(context: Context, raw: String) {
    val payload = JSONObject(raw)
    require(payload.optString("schemaVersion") == "voiceshield.phone-rules.v1") { "Unsupported rules schema" }
    fun arraySet(name: String): Set<String> {
      val array = payload.optJSONArray(name) ?: JSONArray()
      return (0 until minOf(array.length(), 5000)).mapNotNull { array.optString(it).takeIf { value -> value.length in 8..64 } }.toSet()
    }
    val configObject = payload.optJSONObject("config") ?: JSONObject()
    updateConfig(context, configObject.keys().asSequence().associateWith { configObject.opt(it) })
    val importedComplaints = payload.optJSONObject("complaints") ?: JSONObject()
    val safeComplaints = JSONObject()
    val complaintKeys = importedComplaints.keys()
    var acceptedComplaints = 0
    while (complaintKeys.hasNext() && acceptedComplaints < 5000) {
      val key = complaintKeys.next()
      val item = importedComplaints.optJSONObject(key) ?: continue
      if (key.length !in 8..64) continue
      safeComplaints.put(key, JSONObject().apply {
        put("count", item.optInt("count", 0).coerceIn(0, 10_000))
        put("category", item.optString("category", "imported").take(40))
        put("lastAt", item.optLong("lastAt", 0).coerceAtLeast(0))
      })
      acceptedComplaints += 1
    }
    preferences(context).edit()
      .putStringSet("trusted", arraySet("trusted"))
      .putStringSet("blocked", arraySet("blocked"))
      .putString("complaints", safeComplaints.toString())
      .apply()
  }

  fun clear(context: Context) = preferences(context).edit().clear().apply()
}
