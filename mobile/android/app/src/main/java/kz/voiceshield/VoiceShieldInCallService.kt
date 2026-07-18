package kz.voiceshield

import android.telecom.Call
import android.telecom.InCallService

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
