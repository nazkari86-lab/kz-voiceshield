package kz.voiceshield

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class WhisperModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val scope = CoroutineScope(Dispatchers.Default)
  private var whisper: WhisperContext? = null
  private var streamJob: Job? = null

  init { AppRegistry.whisperModule = this }

  override fun getName(): String = "WhisperModule"

  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun initialize(modelPath: String, language: String, promise: Promise) {
    scope.launch {
      whisper?.close()
      whisper = WhisperContext(modelPath, language)
      promise.resolve(true)
    }
  }

  fun pushAudio(chunk: ShortArray) {
    whisper?.process(chunk)
  }

  @ReactMethod
  fun startStreaming(promise: Promise) {
    streamJob?.cancel()
    streamJob = scope.launch {
      while (true) {
        delay(4000)
        val context = whisper ?: continue
        if (context.bufferSize() >= 16000) {
          val payload = Arguments.createMap()
          payload.putString("text", context.transcribe())
          AppRegistry.sendEvent("VS_WHISPER_TRANSCRIPT", payload)
        }
      }
    }
    promise.resolve(null)
  }

  @ReactMethod fun stopStreaming(promise: Promise) { streamJob?.cancel(); promise.resolve(null) }
  @ReactMethod fun resetBuffer(promise: Promise) { whisper?.reset(); promise.resolve(null) }
  @ReactMethod fun getBufferSize(promise: Promise) { promise.resolve(whisper?.bufferSize() ?: 0) }
}
