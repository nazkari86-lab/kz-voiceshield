package kz.voiceshield

import android.app.Activity
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telephony.PhoneNumberUtils
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener

class CallScreeningModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var rolePromise: Promise? = null
  private var dialerRolePromise: Promise? = null
  private val roleListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
      val roleManager = context.getSystemService(Context.ROLE_SERVICE) as RoleManager
      when (requestCode) {
        CALL_SCREENING_ROLE_REQUEST -> {
          val promise = rolePromise ?: return
          rolePromise = null
          promise.resolve(roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING))
        }
        DIALER_ROLE_REQUEST -> {
          val promise = dialerRolePromise ?: return
          dialerRolePromise = null
          promise.resolve(roleManager.isRoleHeld(RoleManager.ROLE_DIALER))
        }
      }
    }
  }

  init { context.addActivityEventListener(roleListener) }
  override fun getName(): String = "CallScreeningModule"

  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(Build.VERSION.SDK_INT >= Build.VERSION_CODES.N)
  }

  @ReactMethod
  fun isRoleHeld(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      promise.resolve(false)
      return
    }
    val roleManager = context.getSystemService(Context.ROLE_SERVICE) as RoleManager
    promise.resolve(roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING))
  }

  @ReactMethod
  fun requestRole(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      promise.resolve(false)
      return
    }
    if (rolePromise != null) {
      promise.reject("ROLE_REQUEST_BUSY", "A call screening role request is already open")
      return
    }
    val activity = currentActivity
    if (activity == null) {
      promise.reject("ACTIVITY_UNAVAILABLE", "Open VoiceShield before requesting the call screening role")
      return
    }
    val roleManager = context.getSystemService(Context.ROLE_SERVICE) as RoleManager
    if (roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) {
      promise.resolve(true)
      return
    }
    val intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)
    rolePromise = promise
    activity.startActivityForResult(intent, CALL_SCREENING_ROLE_REQUEST)
  }

  @ReactMethod
  fun isDialerRoleHeld(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      promise.resolve(false)
      return
    }
    val roleManager = context.getSystemService(Context.ROLE_SERVICE) as RoleManager
    promise.resolve(roleManager.isRoleHeld(RoleManager.ROLE_DIALER))
  }

  @ReactMethod
  fun requestDialerRole(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      promise.resolve(false)
      return
    }
    if (dialerRolePromise != null) {
      promise.reject("ROLE_REQUEST_BUSY", "A default phone role request is already open")
      return
    }
    val activity = currentActivity
    if (activity == null) {
      promise.reject("ACTIVITY_UNAVAILABLE", "Open VoiceShield before requesting the default phone role")
      return
    }
    val roleManager = context.getSystemService(Context.ROLE_SERVICE) as RoleManager
    if (roleManager.isRoleHeld(RoleManager.ROLE_DIALER)) {
      promise.resolve(true)
      return
    }
    dialerRolePromise = promise
    activity.startActivityForResult(roleManager.createRequestRoleIntent(RoleManager.ROLE_DIALER), DIALER_ROLE_REQUEST)
  }

  override fun invalidate() {
    rolePromise?.reject("ROLE_REQUEST_CANCELLED", "Call screening role request was cancelled")
    rolePromise = null
    dialerRolePromise?.reject("ROLE_REQUEST_CANCELLED", "Default phone role request was cancelled")
    dialerRolePromise = null
    context.removeActivityEventListener(roleListener)
    super.invalidate()
  }

  companion object {
    private const val CALL_SCREENING_ROLE_REQUEST = 4110
    private const val DIALER_ROLE_REQUEST = 4111
  }

  @ReactMethod
  fun consumePendingCall(promise: Promise) {
    promise.resolve(CallEventStore.consume(context)?.toWritableMap())
  }

  @ReactMethod
  fun evaluateNumber(number: String, promise: Promise) {
    runCatching {
      require(PhoneNumberUtils.normalizeNumber(number).length >= 3) { "Enter a visible phone number" }
      PhoneReputationStore.assess(context, number, "unverified", false).toWritableMap()
    }
      .onSuccess(promise::resolve)
      .onFailure { promise.reject("PHONE_EVALUATION_FAILED", it.message, it) }
  }

  @ReactMethod
  fun setNumberDisposition(number: String, disposition: String, promise: Promise) {
    runCatching {
      PhoneReputationStore.setDisposition(context, number, disposition)
      PhoneReputationStore.assess(context, number, "unverified", false).toWritableMap()
    }.onSuccess(promise::resolve).onFailure { promise.reject("PHONE_RULE_FAILED", it.message, it) }
  }

  @ReactMethod
  fun reportNumber(number: String, category: String, promise: Promise) {
    runCatching { PhoneReputationStore.report(context, number, category).toWritableMap() }
      .onSuccess(promise::resolve)
      .onFailure { promise.reject("PHONE_REPORT_FAILED", it.message, it) }
  }

  @ReactMethod
  fun annotateNumber(
    number: String,
    rating: Int,
    comment: String,
    relationship: String,
    label: String,
    familyProtected: Boolean,
    promise: Promise,
  ) {
    runCatching {
      PhoneReputationStore.annotate(context, number, rating, comment, relationship, label, familyProtected).toWritableMap()
    }.onSuccess(promise::resolve).onFailure { promise.reject("PHONE_ANNOTATION_FAILED", it.message, it) }
  }

  @ReactMethod
  fun clearNumberAnnotation(number: String, promise: Promise) {
    runCatching { PhoneReputationStore.clearAnnotation(context, number).toWritableMap() }
      .onSuccess(promise::resolve)
      .onFailure { promise.reject("PHONE_ANNOTATION_FAILED", it.message, it) }
  }

  @ReactMethod
  fun getProtectionConfig(promise: Promise) {
    val config = PhoneReputationStore.config(context)
    promise.resolve(Arguments.createMap().apply {
      putBoolean("enabled", config.enabled)
      putBoolean("autoBlockCritical", config.autoBlockCritical)
      putBoolean("blockHidden", config.blockHidden)
      putBoolean("blockInternational", config.blockInternational)
      putBoolean("blockRepeated", config.blockRepeated)
      putBoolean("blockUnknownAtNight", config.blockUnknownAtNight)
      putInt("nightStartHour", config.nightStartHour)
      putInt("nightEndHour", config.nightEndHour)
    })
  }

  @ReactMethod
  fun updateProtectionConfig(values: ReadableMap, promise: Promise) {
    runCatching {
      val map = values.toHashMap()
      PhoneReputationStore.updateConfig(context, map)
    }.onSuccess { getProtectionConfig(promise) }.onFailure { promise.reject("PHONE_CONFIG_FAILED", it.message, it) }
  }

  @ReactMethod
  fun exportProtectionData(promise: Promise) {
    runCatching { PhoneReputationStore.exportData(context) }
      .onSuccess(promise::resolve)
      .onFailure { promise.reject("PHONE_EXPORT_FAILED", it.message, it) }
  }

  @ReactMethod
  fun importProtectionData(payload: String, promise: Promise) {
    runCatching {
      require(payload.length <= 1_000_000) { "Rules backup is too large" }
      PhoneReputationStore.importData(context, payload)
    }
      .onSuccess { promise.resolve(true) }
      .onFailure { promise.reject("PHONE_IMPORT_FAILED", it.message, it) }
  }

  @ReactMethod
  fun clearProtectionData(promise: Promise) {
    PhoneReputationStore.clear(context)
    promise.resolve(true)
  }
}
