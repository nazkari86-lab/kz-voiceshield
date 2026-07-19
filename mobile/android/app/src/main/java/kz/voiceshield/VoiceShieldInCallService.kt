package kz.voiceshield

import android.os.Build
import android.telecom.Call
import android.telecom.InCallService
import com.facebook.react.bridge.Arguments

class VoiceShieldInCallService : InCallService() {
  private val callback = object : Call.Callback() {
    override fun onStateChanged(call: Call, state: Int) {
      VoiceShieldCallController.setCall(call)
      VoiceShieldCallNotifier.show(this@VoiceShieldInCallService, call)
    }
    override fun onDetailsChanged(call: Call, details: Call.Details) {
      VoiceShieldCallController.setCall(call)
      VoiceShieldCallNotifier.show(this@VoiceShieldInCallService, call)
    }
  }

  override fun onCreate() {
    super.onCreate()
    VoiceShieldCallController.attach(this)
  }

  override fun onCallAdded(call: Call) {
    super.onCallAdded(call)
    call.registerCallback(callback)
    VoiceShieldCallController.setCall(call)
    VoiceShieldCallNotifier.show(this, call)
  }

  override fun onCallRemoved(call: Call) {
    call.unregisterCallback(callback)
    val rawNumber = call.details.handle?.schemeSpecificPart
    val disconnectReason = call.details.disconnectCause?.label?.toString().orEmpty().ifBlank { call.details.disconnectCause?.reason.orEmpty() }.ifBlank { "call ended" }
    val assessment = runCatching { PhoneReputationStore.assess(this, rawNumber, "unverified", false) }.getOrNull()
    val connectedAt = call.details.connectTimeMillis
    val durationSeconds = if (connectedAt > 0L) {
      ((System.currentTimeMillis() - connectedAt).coerceAtLeast(0L) / 1000L).toInt()
    } else 0
    val incoming = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || call.details.callDirection == Call.Details.DIRECTION_INCOMING
    val international = rawNumber?.startsWith("+") == true && !rawNumber.startsWith("+7")
    val wangiri = incoming && durationSeconds <= 5 && (rawNumber.isNullOrBlank() || international)
    val event = Arguments.createMap().apply {
      putString("maskedNumber", assessment?.maskedNumber ?: "")
      putString("reason", disconnectReason)
      putInt("durationSeconds", durationSeconds)
      putBoolean("wangiri", wangiri)
      putBoolean("blocked", assessment?.result?.action == "block")
    }
    AppRegistry.sendEvent("VS_CALL_ENDED", event)
    PostCallReviewNotifier.show(this, assessment, disconnectReason)
    if (VoiceShieldCallController.call === call) VoiceShieldCallController.setCall(null)
    VoiceShieldCallNotifier.cancel(this)
    super.onCallRemoved(call)
  }

  override fun onDestroy() {
    VoiceShieldCallController.detach(this)
    super.onDestroy()
  }
}
