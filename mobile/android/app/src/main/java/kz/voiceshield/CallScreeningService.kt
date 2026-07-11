package kz.voiceshield

import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telecom.Connection

class CallScreeningService : CallScreeningService() {
  override fun onScreenCall(callDetails: Call.Details) {
    val direction = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && callDetails.callDirection == Call.Details.DIRECTION_INCOMING) "incoming" else "unknown"
    val verificationStatus = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      when (callDetails.callerNumberVerificationStatus) {
        Connection.VERIFICATION_STATUS_PASSED -> "passed"
        Connection.VERIFICATION_STATUS_FAILED -> "failed"
        else -> "unverified"
      }
    } else {
      "unavailable"
    }
    if (!PhoneReputationStore.config(this).enabled) {
      val event = SafeCallEvent(direction, verificationStatus, System.currentTimeMillis())
      CallEventStore.save(this, event)
      AppRegistry.sendEvent("VS_CALL_INCOMING", event.toWritableMap())
      respondToCall(callDetails, CallResponse.Builder().setDisallowCall(false).setRejectCall(false).setSilenceCall(false).build())
      return
    }
    val assessment = PhoneReputationStore.assess(this, callDetails.handle?.schemeSpecificPart, verificationStatus, true)
    PhoneWarningNotifier.show(this, assessment)
    val event = SafeCallEvent(direction, verificationStatus, System.currentTimeMillis(), assessment)
    CallEventStore.save(this, event)
    AppRegistry.sendEvent("VS_CALL_INCOMING", event.toWritableMap())
    val shouldBlock = assessment.result.action == "block"
    respondToCall(
      callDetails,
      CallResponse.Builder()
        .setDisallowCall(shouldBlock)
        .setRejectCall(shouldBlock)
        .setSilenceCall(false)
        .build(),
    )
  }
}
