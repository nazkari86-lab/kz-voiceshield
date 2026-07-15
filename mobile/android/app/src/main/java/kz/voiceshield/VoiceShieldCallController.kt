package kz.voiceshield

import android.telecom.Call
import android.telecom.CallAudioState
import java.util.concurrent.CopyOnWriteArraySet

object VoiceShieldCallController {
  interface Listener { fun onCallChanged(call: Call?) }

  private val listeners = CopyOnWriteArraySet<Listener>()
  @Volatile private var service: VoiceShieldInCallService? = null
  @Volatile var call: Call? = null
    private set

  fun attach(value: VoiceShieldInCallService) { service = value }
  fun detach(value: VoiceShieldInCallService) { if (service === value) service = null }

  fun setCall(value: Call?) {
    call = value
    listeners.forEach { it.onCallChanged(value) }
  }

  fun addListener(listener: Listener) {
    listeners += listener
    listener.onCallChanged(call)
  }

  fun removeListener(listener: Listener) { listeners -= listener }
  fun answer() { call?.answer(android.telecom.VideoProfile.STATE_AUDIO_ONLY) }
  fun reject() { call?.reject(false, null) }
  fun disconnect() { call?.disconnect() }
  fun setMuted(muted: Boolean) { service?.setMuted(muted) }
  fun setSpeaker(enabled: Boolean) {
    @Suppress("DEPRECATION")
    service?.setAudioRoute(if (enabled) CallAudioState.ROUTE_SPEAKER else CallAudioState.ROUTE_EARPIECE)
  }
}
