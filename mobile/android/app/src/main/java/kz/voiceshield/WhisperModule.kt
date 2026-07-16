package kz.voiceshield

import android.app.ActivityManager
import android.util.Log
import java.io.File
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
import java.util.concurrent.atomic.AtomicBoolean

class WhisperModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  private var whisper: WhisperContext? = null
  private var fastConformer: FastConformerContext? = null
  private val modelLock = Any()
  private val decoding = AtomicBoolean(false)
  private val audioQueue = Channel<ShortArray>(capacity = 8, onBufferOverflow = BufferOverflow.DROP_OLDEST)
  private val audioWorkerJob: Job
  private var streamJob: Job? = null
  private var lastTranscript = ""

  init {
    AppRegistry.whisperModule = this
    // AudioRecord must never wait for model inference. Slow Xiaomi devices can
    // take longer to decode than one capture chunk; stale chunks are dropped
    // from this bounded queue instead of blocking microphone reads.
    audioWorkerJob = scope.launch {
      for (chunk in audioQueue) {
        try {
          synchronized(modelLock) {
            whisper?.process(chunk)
            fastConformer?.process(chunk)
          }
        } catch (error: Throwable) {
          Log.e(TAG, "Speech capture chunk failed", error)
        }
      }
    }
  }

  override fun getName(): String = "WhisperModule"

  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun initialize(modelPath: String, language: String, promise: Promise) {
    scope.launch {
      try {
        val model = File(modelPath)
        require(model.isFile && model.canRead()) { "Speech model file is missing or unreadable. Download it again." }
        require(model.length() > 0L) { "Speech model file is empty. Download it again." }
        val memory = context.getSystemService(ActivityManager::class.java).let { manager ->
          ActivityManager.MemoryInfo().also(manager::getMemoryInfo)
        }
        val requiredRam = requiredRamFor(model.length())
        require(memory.totalMem >= requiredRam) {
          "This model needs at least ${requiredRam / 1_000_000_000} GB RAM. This phone has about ${memory.totalMem / 1_000_000_000} GB; choose Large v3 Turbo Q5, Medium Q5 or FastConformer."
        }
        val threads = recommendedThreads(model.length())
        Log.i(TAG, "Initializing speech model ${model.name}, ${model.length()} bytes, ${threads} threads")
        synchronized(modelLock) {
          whisper?.close()
          fastConformer?.close()
          whisper = null
          fastConformer = null
          if (modelPath.endsWith(".onnx", ignoreCase = true)) {
            fastConformer = FastConformerContext(modelPath, context)
          } else {
            whisper = WhisperContext(modelPath, language, 1, threads)
          }
        }
        lastTranscript = ""
        promise.resolve(true)
      } catch (e: UnsatisfiedLinkError) {
        // whisper.so not bundled or ABI mismatch
        promise.reject("WHISPER_LINK_ERROR", "Native whisper library not found: ${e.message}", e)
      } catch (e: OutOfMemoryError) {
        promise.reject("WHISPER_MEMORY", "Not enough memory to load this speech model. Choose a smaller model or FastConformer.", e)
      } catch (e: Exception) {
        promise.reject("WHISPER_INIT_FAILED", e.message ?: "Unknown init error", e)
      }
    }
  }

  fun pushAudio(chunk: ShortArray) {
    if (chunk.isNotEmpty()) audioQueue.trySend(chunk)
  }

  @ReactMethod
  fun startStreaming(promise: Promise) {
    val ready = synchronized(modelLock) { whisper != null || fastConformer != null }
    if (!ready) {
      promise.reject("WHISPER_NOT_READY", "Speech model is not initialized. Open Setup and prepare Whisper first.")
      return
    }
    streamJob?.cancel()
    streamJob = scope.launch {
      while (true) {
        delay(3000)
        try {
          val bufferedSamples = synchronized(modelLock) {
            whisper?.bufferSize() ?: fastConformer?.bufferSize() ?: 0
          }
          val status = Arguments.createMap()
          status.putInt("bufferedSamples", bufferedSamples)
          status.putBoolean("modelReady", bufferedSamples > 0 || synchronized(modelLock) { whisper != null || fastConformer != null })
          AppRegistry.sendEvent("VS_WHISPER_STATUS", status)
          // Decode after one second of PCM. Short speech segments are common in
          // calls; waiting for two seconds and dropping an empty window made the
          // phone appear active while silently losing the phrase.
          if (bufferedSamples >= 16_000) {
            val startedAt = System.currentTimeMillis()
            if (!decoding.compareAndSet(false, true)) continue
            val text = try {
              synchronized(modelLock) {
                (whisper?.transcribe() ?: fastConformer?.transcribe().orEmpty()).trim()
              }
            } finally {
              decoding.set(false)
            }
            if (text.isEmpty() || text == lastTranscript) continue
            lastTranscript = text
            val payload = Arguments.createMap()
            payload.putString("text", text)
            payload.putDouble("latencyMs", (System.currentTimeMillis() - startedAt).toDouble())
            AppRegistry.sendEvent("VS_WHISPER_TRANSCRIPT", payload)
          }
        } catch (error: Throwable) {
          Log.e(TAG, "Speech decode failed", error)
          val payload = Arguments.createMap()
          payload.putString("message", error.message ?: "Speech model failed to decode microphone audio")
          AppRegistry.sendEvent("VS_WHISPER_ERROR", payload)
        }
      }
    }
    promise.resolve(null)
  }

  @ReactMethod fun stopStreaming(promise: Promise) { streamJob?.cancel(); streamJob = null; promise.resolve(null) }
  @ReactMethod fun isInitialized(promise: Promise) = synchronized(modelLock) {
    promise.resolve(whisper != null || fastConformer != null)
  }
  @ReactMethod fun resetBuffer(promise: Promise) = synchronized(modelLock) {
    whisper?.reset()
    fastConformer?.reset()
    lastTranscript = ""
    promise.resolve(null)
  }
  @ReactMethod fun getBufferSize(promise: Promise) = synchronized(modelLock) {
    promise.resolve(whisper?.bufferSize() ?: fastConformer?.bufferSize() ?: 0)
  }

  override fun invalidate() {
    audioQueue.close()
    audioWorkerJob.cancel()
    streamJob?.cancel()
    streamJob = null
    synchronized(modelLock) {
      whisper?.close()
      whisper = null
      fastConformer?.close()
      fastConformer = null
    }
    AppRegistry.whisperModule = null
    scope.cancel()
    super.invalidate()
  }

  private fun requiredRamFor(modelBytes: Long): Long = when {
    modelBytes >= 1_200_000_000L -> 12_000_000_000L
    modelBytes >= 800_000_000L -> 10_000_000_000L
    modelBytes >= 500_000_000L -> 6_000_000_000L
    modelBytes >= 450_000_000L -> 4_000_000_000L
    modelBytes >= 130_000_000L -> 2_000_000_000L
    else -> 1_500_000_000L
  }

  private fun recommendedThreads(modelBytes: Long): Int = when {
    modelBytes >= 1_200_000_000L -> 2
    modelBytes >= 700_000_000L -> 3
    else -> 4
  }

  companion object {
    private const val TAG = "VoiceShieldWhisper"
  }
}
