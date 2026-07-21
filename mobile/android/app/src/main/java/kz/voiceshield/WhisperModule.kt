package kz.voiceshield

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
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

class WhisperModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  private var whisper: WhisperContext? = null
  private var fastConformer: FastConformerContext? = null
  private var streamJob: Job? = null
  private val audioQueue = Channel<ShortArray>(
    capacity = 8,
    onBufferOverflow = BufferOverflow.DROP_OLDEST,
  )
  private var audioWorkerJob: Job
  private var lastTranscript = ""
  private val decodeInFlight = AtomicBoolean(false)
  private val streamActive = AtomicBoolean(false)
  private val decodeSequence = AtomicLong(0)
  private val modelMutex = Mutex()

  init {
    AppRegistry.whisperModule = this
    // AudioRecord must never wait for a model inference. On slower Xiaomi
    // devices a decode can take longer than a capture chunk; keeping this work
    // off the recorder thread prevents buffer starvation and UI stalls.
    audioWorkerJob = scope.launch {
      for (chunk in audioQueue) {
        try {
          if (!streamActive.get()) continue
          modelMutex.withLock {
            if (!streamActive.get()) return@withLock
            whisper?.process(chunk)
            fastConformer?.process(chunk)
          }
        } catch (_: Throwable) {
          // A bad model/chunk must not kill the capture worker permanently.
        }
      }
    }
  }

  override fun getName(): String = "WhisperModule"

  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun initialize(modelPath: String, language: String, promise: Promise) {
    if (decodeInFlight.get()) {
      promise.reject("WHISPER_BUSY", "Speech engine is still finishing the previous audio. Wait a moment before changing models.")
      return
    }
    scope.launch {
      try {
        streamActive.set(false)
        streamJob?.cancel()
        streamJob = null
        drainAudioQueue()
        modelMutex.withLock {
          whisper?.close()
          fastConformer?.close()
          whisper = null
          fastConformer = null
          if (modelPath.endsWith(".onnx", ignoreCase = true)) {
            fastConformer = FastConformerContext(modelPath, context)
          } else {
            whisper = WhisperContext(modelPath, language)
          }
          lastTranscript = ""
        }
        promise.resolve(true)
      } catch (e: UnsatisfiedLinkError) {
        // whisper.so not bundled or ABI mismatch
        promise.reject("WHISPER_LINK_ERROR", "Native whisper library not found: ${e.message}", e)
      } catch (e: Exception) {
        promise.reject("WHISPER_INIT_FAILED", e.message ?: "Unknown init error", e)
      }
    }
  }

  fun pushAudio(chunk: ShortArray) {
    if (chunk.isNotEmpty() && streamActive.get()) audioQueue.trySend(chunk)
  }

  @ReactMethod
  fun startStreaming(promise: Promise) {
    if (whisper == null && fastConformer == null) {
      promise.reject("WHISPER_NOT_READY", "Speech model is not initialized. Open Setup and prepare Whisper first.")
      return
    }
    if (decodeInFlight.get()) {
      promise.reject("WHISPER_BUSY", "Speech engine is still processing the previous audio. Stop protection, wait, and start again.")
      return
    }
    if (streamJob?.isActive == true) {
      promise.resolve(null)
      return
    }
    streamActive.set(true)
    streamJob = scope.launch {
      while (true) {
        delay(3000)
        val bufferedSamples = whisper?.bufferSize() ?: fastConformer?.bufferSize() ?: 0
        if (bufferedSamples >= 32000) {
          val startedAt = System.currentTimeMillis()
          val sequence = decodeSequence.incrementAndGet()
          decodeInFlight.set(true)
          val watchdog = scope.launch {
            delay(DECODE_WATCHDOG_MS)
            if (decodeInFlight.get() && decodeSequence.get() == sequence) {
              val payload = Arguments.createMap()
              payload.putString("message", "Speech recognition did not finish in time. Protection was stopped to keep the phone responsive.")
              AppRegistry.sendEvent("VS_WHISPER_DECODE_STALLED", payload)
            }
          }
          val text = try {
            modelMutex.withLock { (whisper?.transcribe() ?: fastConformer?.transcribe().orEmpty()).trim() }
          } catch (_: Throwable) {
            ""
          } finally {
            watchdog.cancel()
            if (decodeSequence.get() == sequence) decodeInFlight.set(false)
          }
          if (text.isEmpty() || text == lastTranscript) continue
          lastTranscript = text
          val payload = Arguments.createMap()
          payload.putString("text", text)
          payload.putDouble("latencyMs", (System.currentTimeMillis() - startedAt).toDouble())
          AppRegistry.sendEvent("VS_WHISPER_TRANSCRIPT", payload)
        }
      }
    }
    promise.resolve(null)
  }

  @ReactMethod fun stopStreaming(promise: Promise) {
    streamActive.set(false)
    streamJob?.cancel()
    streamJob = null
    drainAudioQueue()
    promise.resolve(null)
  }
  @ReactMethod fun isInitialized(promise: Promise) { promise.resolve(whisper != null || fastConformer != null) }
  @ReactMethod fun resetBuffer(promise: Promise) {
    // Do not reset or replace a native context while a synchronous decode is active.
    // Coroutine cancellation cannot interrupt a blocking JNI call.
    if (decodeInFlight.get()) {
      promise.reject("WHISPER_BUSY", "Speech engine is still processing audio. Wait for it to finish before restarting protection.")
      return
    }
    scope.launch {
      streamActive.set(false)
      streamJob?.cancel()
      streamJob = null
      drainAudioQueue()
      modelMutex.withLock {
        whisper?.reset()
        fastConformer?.reset()
        lastTranscript = ""
      }
      promise.resolve(null)
    }
  }
  @ReactMethod fun getBufferSize(promise: Promise) { promise.resolve(whisper?.bufferSize() ?: fastConformer?.bufferSize() ?: 0) }

  override fun invalidate() {
    streamActive.set(false)
    drainAudioQueue()
    audioQueue.close()
    audioWorkerJob.cancel()
    streamJob?.cancel()
    streamJob = null
    whisper?.close()
    whisper = null
    fastConformer?.close()
    fastConformer = null
    AppRegistry.whisperModule = null
    scope.cancel()
    super.invalidate()
  }

  private fun drainAudioQueue() {
    while (audioQueue.tryReceive().isSuccess) { /* discard stale session audio */ }
  }

  private companion object {
    const val DECODE_WATCHDOG_MS = 15_000L
  }
}
