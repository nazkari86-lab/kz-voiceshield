package kz.voiceshield

import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import com.facebook.react.bridge.Arguments

class CallScreeningService : CallScreeningService() {
  override fun onScreenCall(callDetails: Call.Details) {
    val payload = Arguments.createMap()
    payload.putString("handle", callDetails.handle?.schemeSpecificPart ?: "unknown")
    payload.putString("direction", if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && callDetails.callDirection == Call.Details.DIRECTION_INCOMING) "incoming" else "unknown")
    AppRegistry.sendEvent("VS_CALL_INCOMING", payload)
    respondToCall(callDetails, CallResponse.Builder().setDisallowCall(false).setRejectCall(false).setSilenceCall(false).build())
  }
}
