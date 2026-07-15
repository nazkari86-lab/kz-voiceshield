package kz.voiceshield

import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlin.math.abs

class AudioCaptureModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  private var recorder: AudioRecord? = null
  private var job: Job? = null
  private val preprocessor = AudioPreprocessor()

  override fun getName(): String = "AudioCaptureModule"

  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun startCapture(promise: Promise) {
    try {
      if (recorder?.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
        promise.resolve(null)
        return
      }
      val minBuffer = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      if (minBuffer <= 0) {
        promise.reject("AUDIO_UNAVAILABLE", "Microphone input is unavailable on this device")
        return
      }
      // MIC is intentionally first. On several Xiaomi/MIUI builds VOICE_RECOGNITION
      // can interfere with the active call audio route, muting the speaker or leaving
      // the recorder silent. MIC captures the acoustic speaker output without changing
      // the Telecom audio route. VOICE_RECOGNITION remains a compatibility fallback.
      val source = startRecorder(minBuffer)
      if (source == null) {
        promise.reject("AUDIO_PERMISSION_OR_BUSY", "Microphone permission is missing or the microphone is busy")
        return
      }
      val started = Arguments.createMap()
      started.putString("source", source)
      AppRegistry.sendEvent("VS_AUDIO_CAPTURE_STARTED", started)
      emitRouteStatus()
      job = scope.launch {
        val buffer = ShortArray(1600)
        while (recorder?.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
          val read = recorder?.read(buffer, 0, buffer.size) ?: 0
          if (read > 0) {
            AppRegistry.whisperModule?.pushAudio(preprocessor.process(buffer.copyOf(read)))
            val payload = Arguments.createMap()
            payload.putDouble("level", buffer.take(read).maxOf { abs(it.toInt()) } / 32768.0)
            AppRegistry.sendEvent("VS_AUDIO_LEVEL", payload)
          } else if (read < 0) {
            val payload = Arguments.createMap()
            payload.putString("message", "Android microphone read failed (code $read). Stop protection and start it again.")
            AppRegistry.sendEvent("VS_AUDIO_CAPTURE_ERROR", payload)
            break
          }
        }
      }
      promise.resolve(null)
    } catch (error: Throwable) {
      recorder?.release()
      recorder = null
      promise.reject("AUDIO_START_FAILED", error)
    }
  }

  @ReactMethod
  fun stopCapture(promise: Promise) {
    stopInternal()
    promise.resolve(null)
  }

  override fun invalidate() {
    stopInternal()
    scope.cancel()
    super.invalidate()
  }

  private fun stopInternal() {
    job?.cancel()
    job = null
    try {
      recorder?.stop()
    } catch (_: Throwable) {
    }
    recorder?.release()
    recorder = null
  }

  private fun startRecorder(minBuffer: Int): String? {
    val sources = listOf(
      MediaRecorder.AudioSource.MIC to "microphone",
      MediaRecorder.AudioSource.VOICE_RECOGNITION to "voice_recognition",
    )
    for ((source, name) in sources) {
      val candidate = try {
        AudioRecord(
          source,
          16000,
          AudioFormat.CHANNEL_IN_MONO,
          AudioFormat.ENCODING_PCM_16BIT,
          minBuffer * 4,
        )
      } catch (_: Throwable) {
        null
      }
      if (candidate?.state != AudioRecord.STATE_INITIALIZED) {
        candidate?.release()
        continue
      }
      try {
        candidate.startRecording()
      } catch (_: Throwable) {
        candidate.release()
        continue
      }
      if (candidate.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
        recorder = candidate
        return name
      }
      candidate.release()
    }
    return null
  }

  private fun emitRouteStatus() {
    val manager = context.getSystemService(AudioManager::class.java)
    val payload = Arguments.createMap()
    payload.putBoolean("speakerphoneOn", manager.isSpeakerphoneOn)
    payload.putBoolean("bluetoothScoOn", manager.isBluetoothScoOn)
    payload.putBoolean("microphoneMuted", manager.isMicrophoneMute)
    AppRegistry.sendEvent("VS_AUDIO_ROUTE_STATUS", payload)
  }
}
