package kz.voiceshield

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.provider.ContactsContract
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
  val blockUnknownNotContacts: Boolean = false,
  val blockRepeated: Boolean = true,
  val blockUnknownAtNight: Boolean = false,
  val repeatedMinIntervalSeconds: Int = 5,
  val nightStartHour: Int = 22,
  val nightEndHour: Int = 7,
  val quietHoursEnabled: Boolean = false,
  val quietStartMinute: Int = 22 * 60,
  val quietEndMinute: Int = 7 * 60,
  val allowTrustedDuringQuiet: Boolean = true,
)

data class PhoneAssessment(
  val numberKey: String,
  val maskedNumber: String,
  val result: PhoneRiskResult,
  val complaintCount: Int,
  val lastComplaintAt: Long,
  val annotation: PhoneAnnotation = PhoneAnnotation(),
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
    putMap("annotation", annotation.toWritableMap())
  }
}

data class PhoneAnnotation(
  val rating: Int = 0,
  val comment: String = "",
  val label: String = "",
  val relationship: String = "unknown",
  val familyProtected: Boolean = false,
  val updatedAt: Long = 0,
) {
  fun toWritableMap(): WritableMap = Arguments.createMap().apply {
    putInt("rating", rating)
    putString("comment", comment)
    putString("label", label)
    putString("relationship", relationship)
    putBoolean("familyProtected", familyProtected)
    putDouble("updatedAt", updatedAt.toDouble())
  }

  fun toJson(includePrivateText: Boolean = true): JSONObject = JSONObject().apply {
    put("rating", rating)
    if (includePrivateText) {
      put("comment", comment)
      put("label", label)
    }
    put("relationship", relationship)
    put("familyProtected", familyProtected)
    put("updatedAt", updatedAt)
  }
}

data class PhoneCustomRule(
  val id: String,
  val label: String,
  val pattern: String,
  val action: String,
  val enabled: Boolean = true,
  val updatedAt: Long = System.currentTimeMillis(),
) {
  fun toWritableMap(): WritableMap = Arguments.createMap().apply {
    putString("id", id)
    putString("label", label)
    putString("pattern", pattern)
    putString("action", action)
    putBoolean("enabled", enabled)
    putDouble("updatedAt", updatedAt.toDouble())
  }

  fun toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("label", label)
    put("pattern", pattern)
    put("action", action)
    put("enabled", enabled)
    put("updatedAt", updatedAt)
  }
}

object PhoneReputationStore {
  private const val PREFS = "voiceshield_phone_reputation_v1"
  private const val HMAC_ALIAS = "voiceshield_phone_hmac_v1"
  private const val WINDOW_MS = 10 * 60 * 1000L
  private const val MAX_HISTORY_AGE_MS = 24 * 60 * 60 * 1000L
  private const val ANNOTATIONS_KEY = "phone.annotations.v2"
  private const val CUSTOM_RULES_KEY = "phone.custom-rules.v1"
  private val relationships = setOf("unknown", "family", "friend", "work", "bank", "delivery", "medical", "government")
  private val ruleActions = setOf("warn", "suggest_reject", "block")

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

  private fun annotations(context: Context): JSONObject = runCatching {
    JSONObject(EncryptedLocalStore.get(context, ANNOTATIONS_KEY) ?: "{}")
  }.getOrDefault(JSONObject())

  private fun annotation(context: Context, key: String): PhoneAnnotation {
    return annotationFromJson(annotations(context).optJSONObject(key))
  }

  private fun annotationFromJson(item: JSONObject?): PhoneAnnotation {
    item ?: return PhoneAnnotation()
    return PhoneAnnotation(
      rating = item.optInt("rating", 0).coerceIn(0, 5),
      comment = item.optString("comment", "").take(500),
      label = item.optString("label", "").take(80),
      relationship = item.optString("relationship", "unknown").takeIf(relationships::contains) ?: "unknown",
      familyProtected = item.optBoolean("familyProtected", false),
      updatedAt = item.optLong("updatedAt", 0).coerceAtLeast(0),
    )
  }

  fun config(context: Context): PhoneProtectionConfig {
    val prefs = preferences(context)
    return PhoneProtectionConfig(
      enabled = prefs.getBoolean("enabled", false),
      autoBlockCritical = prefs.getBoolean("autoBlockCritical", false),
      blockHidden = prefs.getBoolean("blockHidden", false),
      blockInternational = prefs.getBoolean("blockInternational", false),
      blockUnknownNotContacts = prefs.getBoolean("blockUnknownNotContacts", false),
      blockRepeated = prefs.getBoolean("blockRepeated", true),
      blockUnknownAtNight = prefs.getBoolean("blockUnknownAtNight", false),
      repeatedMinIntervalSeconds = prefs.getInt("repeatedMinIntervalSeconds", 5).coerceIn(1, 300),
      nightStartHour = prefs.getInt("nightStartHour", 22).coerceIn(0, 23),
      nightEndHour = prefs.getInt("nightEndHour", 7).coerceIn(0, 23),
      quietHoursEnabled = prefs.getBoolean("quietHoursEnabled", prefs.getBoolean("blockUnknownAtNight", false)),
      quietStartMinute = prefs.getInt("quietStartMinute", 22 * 60).coerceIn(0, 1439),
      quietEndMinute = prefs.getInt("quietEndMinute", 7 * 60).coerceIn(0, 1439),
      allowTrustedDuringQuiet = prefs.getBoolean("allowTrustedDuringQuiet", true),
    )
  }

  fun updateConfig(context: Context, values: Map<String, Any?>): PhoneProtectionConfig {
    val editor = preferences(context).edit()
    listOf("enabled", "autoBlockCritical", "blockHidden", "blockInternational", "blockUnknownNotContacts", "blockRepeated", "blockUnknownAtNight", "quietHoursEnabled", "allowTrustedDuringQuiet").forEach { key ->
      (values[key] as? Boolean)?.let { editor.putBoolean(key, it) }
    }
    (values["repeatedMinIntervalSeconds"] as? Number)?.toInt()?.coerceIn(1, 300)?.let { editor.putInt("repeatedMinIntervalSeconds", it) }
    (values["nightStartHour"] as? Number)?.toInt()?.coerceIn(0, 23)?.let { editor.putInt("nightStartHour", it) }
    (values["nightEndHour"] as? Number)?.toInt()?.coerceIn(0, 23)?.let { editor.putInt("nightEndHour", it) }
    (values["quietStartMinute"] as? Number)?.toInt()?.coerceIn(0, 1439)?.let { editor.putInt("quietStartMinute", it) }
    (values["quietEndMinute"] as? Number)?.toInt()?.coerceIn(0, 1439)?.let { editor.putInt("quietEndMinute", it) }
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
    val annotation = annotation(context, key)
    val normalized = normalize(number)
    val cfg = config(context)
    val knownContact = isKnownContact(context, normalized)
    val customRuleMatch = matchCustomRule(context, normalized)
    val localTime = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) LocalTime.now() else null
    val minuteOfDay = localTime?.let { it.hour * 60 + it.minute } ?: 12 * 60
    val quietHours = cfg.quietHoursEnabled && if (cfg.quietStartMinute > cfg.quietEndMinute) {
      minuteOfDay >= cfg.quietStartMinute || minuteOfDay < cfg.quietEndMinute
    } else {
      minuteOfDay in cfg.quietStartMinute until cfg.quietEndMinute
    }
    val quietProtection = quietHours && (!cfg.allowTrustedDuringQuiet || (!trusted && !annotation.familyProtected))
    val result = PhoneReputationPolicy.evaluate(
      PhoneRiskInput(
        verificationStatus = verificationStatus,
        trusted = trusted,
        blocked = blocked,
        familyProtected = annotation.familyProtected,
        userRating = annotation.rating,
        hidden = normalized.isEmpty(),
        international = normalized.startsWith("+") && !normalized.startsWith("+7"),
        complaintCount = complaint?.optInt("count", 0) ?: 0,
        recentCallCount = recent.count { it > now - WINDOW_MS },
        rapidRepeatCount = recent.count { it in (now - cfg.repeatedMinIntervalSeconds * 1000L) until now },
        distinctRecentCallers = distinctRecentCallers,
        knownContact = knownContact,
        customRuleScore = when (customRuleMatch?.action) {
          "block" -> 100
          "suggest_reject" -> 75
          "warn" -> 45
          else -> 0
        },
        customRuleReason = customRuleMatch?.let { "Matched local rule: ${it.label.ifBlank { it.pattern }}" }.orEmpty(),
        quietHours = quietProtection,
        blockHidden = cfg.blockHidden,
        blockInternational = cfg.blockInternational,
        blockUnknownNotContacts = cfg.blockUnknownNotContacts,
        blockRepeated = cfg.blockRepeated,
        blockUnknownAtNight = cfg.blockUnknownAtNight,
        autoBlockCritical = cfg.autoBlockCritical,
        kzNeighborSpoofSignal = normalized.startsWith("+77") || normalized.startsWith("+772"),
      ),
    )
    return PhoneAssessment(key, mask(number), result, complaint?.optInt("count", 0) ?: 0, complaint?.optLong("lastAt", 0) ?: 0, annotation)
  }

  private fun isKnownContact(context: Context, normalized: String): Boolean {
    if (normalized.length < 3) return false
    if (context.checkSelfPermission(android.Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) return false
    return runCatching {
      val uri = android.net.Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, android.net.Uri.encode(normalized))
      context.contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup._ID), null, null, null)?.use { cursor ->
        cursor.moveToFirst()
      } == true
    }.getOrDefault(false)
  }

  private fun rules(context: Context): List<PhoneCustomRule> = runCatching {
    val array = JSONArray(EncryptedLocalStore.get(context, CUSTOM_RULES_KEY) ?: "[]")
    (0 until minOf(array.length(), 100)).mapNotNull { index -> ruleFromJson(array.optJSONObject(index)) }
  }.getOrDefault(emptyList())

  private fun ruleFromJson(item: JSONObject?): PhoneCustomRule? {
    item ?: return null
    val id = item.optString("id", "").take(80)
    val label = item.optString("label", "").take(80)
    val pattern = item.optString("pattern", "").take(160)
    val action = item.optString("action", "warn").takeIf(ruleActions::contains) ?: "warn"
    if (id.isBlank() || pattern.isBlank()) return null
    return PhoneCustomRule(
      id = id,
      label = label,
      pattern = pattern,
      action = action,
      enabled = item.optBoolean("enabled", true),
      updatedAt = item.optLong("updatedAt", 0).coerceAtLeast(0),
    )
  }

  private fun saveRules(context: Context, values: List<PhoneCustomRule>) {
    val array = JSONArray()
    values.take(100).forEach { array.put(it.toJson()) }
    if (array.length() == 0) EncryptedLocalStore.remove(context, CUSTOM_RULES_KEY)
    else EncryptedLocalStore.put(context, CUSTOM_RULES_KEY, array.toString())
  }

  private fun matchCustomRule(context: Context, normalized: String): PhoneCustomRule? {
    if (normalized.isBlank()) return null
    return rules(context)
      .filter { it.enabled }
      .firstOrNull { rule ->
        runCatching { Regex(rule.pattern).containsMatchIn(normalized) }.getOrDefault(false)
      }
  }

  fun listCustomRules(context: Context): List<PhoneCustomRule> = rules(context)

  @Synchronized
  fun upsertCustomRule(context: Context, label: String, pattern: String, action: String, enabled: Boolean): PhoneCustomRule {
    val cleanedPattern = pattern.trim().take(160)
    require(cleanedPattern.length in 2..160) { "Rule pattern must be 2-160 characters" }
    require(action in ruleActions) { "Unsupported rule action" }
    runCatching { Regex(cleanedPattern) }.getOrElse { throw IllegalArgumentException("Invalid regex pattern") }
    val cleanedLabel = label.trim().take(80).ifBlank { "Custom number rule" }
    val id = Base64.encodeToString("$cleanedLabel:$cleanedPattern".toByteArray(), Base64.NO_WRAP or Base64.URL_SAFE).take(40)
    val nextRule = PhoneCustomRule(id, cleanedLabel, cleanedPattern, action, enabled)
    val next = rules(context).filterNot { it.id == id }.plus(nextRule).takeLast(100)
    saveRules(context, next)
    return nextRule
  }

  @Synchronized
  fun deleteCustomRule(context: Context, id: String) {
    saveRules(context, rules(context).filterNot { it.id == id.take(80) })
  }

  @Synchronized
  fun annotate(
    context: Context,
    number: String,
    rating: Int,
    comment: String,
    relationship: String,
    label: String,
    familyProtected: Boolean,
  ): PhoneAssessment {
    val key = fingerprint(number)
    require(key != "hidden") { "Enter a visible phone number" }
    require(rating in 0..5) { "Rating must be between 0 and 5" }
    require(relationship in relationships) { "Unsupported relationship" }
    val item = PhoneAnnotation(
      rating = rating,
      comment = comment.trim().take(500),
      label = label.trim().take(80),
      relationship = relationship,
      familyProtected = familyProtected || relationship == "family",
      updatedAt = System.currentTimeMillis(),
    )
    val values = annotations(context)
    values.put(key, item.toJson())
    EncryptedLocalStore.put(context, ANNOTATIONS_KEY, values.toString())
    if (item.familyProtected) setDisposition(context, number, "trusted")
    return assess(context, number, "unverified", false)
  }

  @Synchronized
  fun clearAnnotation(context: Context, number: String): PhoneAssessment {
    val key = fingerprint(number)
    require(key != "hidden") { "Enter a visible phone number" }
    val values = annotations(context)
    values.remove(key)
    if (values.length() == 0) EncryptedLocalStore.remove(context, ANNOTATIONS_KEY)
    else EncryptedLocalStore.put(context, ANNOTATIONS_KEY, values.toString())
    return assess(context, number, "unverified", false)
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
      put("schemaVersion", "voiceshield.phone-rules.v2")
      put("exportedAt", System.currentTimeMillis())
      put("config", JSONObject().apply {
        val cfg = config(context)
        put("enabled", cfg.enabled)
        put("autoBlockCritical", cfg.autoBlockCritical)
        put("blockHidden", cfg.blockHidden)
        put("blockInternational", cfg.blockInternational)
        put("blockUnknownNotContacts", cfg.blockUnknownNotContacts)
        put("blockRepeated", cfg.blockRepeated)
        put("blockUnknownAtNight", cfg.blockUnknownAtNight)
        put("repeatedMinIntervalSeconds", cfg.repeatedMinIntervalSeconds)
        put("nightStartHour", cfg.nightStartHour)
        put("nightEndHour", cfg.nightEndHour)
        put("quietHoursEnabled", cfg.quietHoursEnabled)
        put("quietStartMinute", cfg.quietStartMinute)
        put("quietEndMinute", cfg.quietEndMinute)
        put("allowTrustedDuringQuiet", cfg.allowTrustedDuringQuiet)
      })
      put("trusted", JSONArray(prefs.getStringSet("trusted", emptySet()).orEmpty().toList()))
      put("blocked", JSONArray(prefs.getStringSet("blocked", emptySet()).orEmpty().toList()))
      put("complaints", JSONObject(prefs.getString("complaints", "{}") ?: "{}"))
      put("annotationSummary", JSONObject().apply {
        val source = annotations(context)
        val keys = source.keys()
        while (keys.hasNext()) {
          val key = keys.next()
          val item = annotationFromJson(source.optJSONObject(key))
          put(key, item.toJson(includePrivateText = false))
        }
      })
      put("customRules", JSONArray().apply { rules(context).forEach { put(it.toJson()) } })
      put("privacy", "Contains device-bound HMAC identifiers. Encrypted labels and comments are intentionally excluded.")
    }.toString(2)
  }

  fun importData(context: Context, raw: String) {
    val payload = JSONObject(raw)
    require(payload.optString("schemaVersion") in setOf("voiceshield.phone-rules.v1", "voiceshield.phone-rules.v2")) { "Unsupported rules schema" }
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
    val importedAnnotations = payload.optJSONObject("annotationSummary") ?: JSONObject()
    val safeAnnotations = JSONObject()
    val annotationKeys = importedAnnotations.keys()
    var acceptedAnnotations = 0
    while (annotationKeys.hasNext() && acceptedAnnotations < 5000) {
      val key = annotationKeys.next()
      val item = importedAnnotations.optJSONObject(key) ?: continue
      if (key.length !in 8..64) continue
      val relationship = item.optString("relationship", "unknown").takeIf(relationships::contains) ?: "unknown"
      safeAnnotations.put(key, PhoneAnnotation(
        rating = item.optInt("rating", 0).coerceIn(0, 5),
        relationship = relationship,
        familyProtected = item.optBoolean("familyProtected", false),
        updatedAt = item.optLong("updatedAt", 0).coerceAtLeast(0),
      ).toJson())
      acceptedAnnotations += 1
    }
    if (safeAnnotations.length() > 0) EncryptedLocalStore.put(context, ANNOTATIONS_KEY, safeAnnotations.toString())
    val importedRules = payload.optJSONArray("customRules") ?: JSONArray()
    val safeRules = (0 until minOf(importedRules.length(), 100)).mapNotNull { ruleFromJson(importedRules.optJSONObject(it)) }
    if (safeRules.isNotEmpty()) saveRules(context, safeRules)
  }

  fun clear(context: Context) {
    preferences(context).edit().clear().apply()
    runCatching { EncryptedLocalStore.remove(context, ANNOTATIONS_KEY) }
    runCatching { EncryptedLocalStore.remove(context, CUSTOM_RULES_KEY) }
  }
}
