package kz.voiceshield

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.k2fsa.sherpa.onnx.SileroVadModelConfig
import com.k2fsa.sherpa.onnx.Vad
import com.k2fsa.sherpa.onnx.VadModelConfig
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Optional Silero VAD evidence module backed by the existing sherpa-onnx JNI.
 * It is not inserted into the Live Shield capture loop; callers explicitly
 * load it and submit copied frames for speech-presence quality checks.
 */
class SileroVADModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "SileroVADModule"

  private val executor: ExecutorService = Executors.newSingleThreadExecutor()
  private val lock = Any()
  private var vad: Vad? = null
  private var modelLoaded = false
  private var energyThreshold = 0.01f
  private var zcThreshold = 0.15f

  @ReactMethod
  fun loadModel(modelPath: String?, promise: Promise) {
    executor.execute {
      try {
        val path = resolveModelPath(modelPath)
        val config = VadModelConfig.builder()
          .setSileroVadModelConfig(SileroVadModelConfig.builder().setModel(path).setThreshold(0.5f).setWindowSize(512).build())
          .setSampleRate(TARGET_SAMPLE_RATE)
          .setNumThreads(1)
          .setDebug(false)
          .setProvider("cpu")
          .build()
        val next = Vad(config)
        synchronized(lock) {
          vad?.release()
          vad = next
          modelLoaded = true
        }
        promise.resolve(true)
      } catch (error: Throwable) {
        synchronized(lock) { modelLoaded = false; vad?.release(); vad = null }
        promise.resolve(false)
      }
    }
  }

  @ReactMethod
  fun processFrame(samplesArray: ReadableArray, sampleRate: Int, promise: Promise) {
    val samples = FloatArray(samplesArray.size().coerceAtMost(MAX_FRAME_SAMPLES)) { samplesArray.getDouble(it).toFloat() }
    executor.execute {
      try {
        val score = synchronized(lock) {
          val activeVad = vad
          if (modelLoaded && activeVad != null) activeVad.compute(resample(samples, sampleRate, TARGET_SAMPLE_RATE)).toDouble()
          else heuristicVAD(samples).toDouble()
        }
        promise.resolve(score.coerceIn(0.0, 1.0))
      } catch (error: Throwable) {
        promise.reject("VAD_ERROR", error)
      }
    }
  }

  @ReactMethod
  fun setThresholds(energy: Double, zcr: Double, promise: Promise) {
    synchronized(lock) { energyThreshold = energy.toFloat(); zcThreshold = zcr.toFloat() }
    promise.resolve(null)
  }

  @ReactMethod
  fun isModelLoaded(promise: Promise) {
    promise.resolve(synchronized(lock) { modelLoaded })
  }

  override fun invalidate() {
    synchronized(lock) {
      modelLoaded = false
      vad?.release()
      vad = null
    }
    executor.shutdownNow()
    super.invalidate()
  }

  private fun resolveModelPath(requested: String?): String {
    val requestedFile = requested?.takeIf { it.isNotBlank() }?.let(::File)
    if (requestedFile?.isFile == true) return requestedFile.absolutePath
    return VoiceModelAssets.copyVerified(context, "silero_vad.onnx", "silero_vad.onnx", SILERO_BYTES, SILERO_SHA256)
  }

  private fun resample(input: FloatArray, from: Int, to: Int): FloatArray {
    require(from > 0) { "sampleRate must be positive" }
    if (input.isEmpty() || from == to) return input
    val size = maxOf(1, (input.size.toLong() * to / from).toInt())
    return FloatArray(size) { index ->
      val position = index.toDouble() * (input.size - 1) / maxOf(1, size - 1)
      val left = position.toInt().coerceIn(0, input.lastIndex)
      val right = (left + 1).coerceAtMost(input.lastIndex)
      input[left] + (input[right] - input[left]) * (position - left).toFloat()
    }
  }

  private fun heuristicVAD(samples: FloatArray): Float {
    if (samples.isEmpty()) return 0f
    val rms = kotlin.math.sqrt(samples.map { it * it }.average()).toFloat()
    var crossings = 0
    for (i in 1 until samples.size) if ((samples[i] >= 0) != (samples[i - 1] >= 0)) crossings++
    val zcr = crossings.toFloat() / samples.size
    val energyScore = (rms / (energyThreshold * 5)).coerceIn(0f, 1f)
    val zcrScore = if (zcr in 0.05f..0.4f) 1f else 0.3f
    return (energyScore * 0.7f + zcrScore * 0.3f).coerceIn(0f, 1f)
  }

  companion object {
    private const val TARGET_SAMPLE_RATE = 16_000
    private const val MAX_FRAME_SAMPLES = 1_000_000
    private const val SILERO_BYTES = 643_854L
    private const val SILERO_SHA256 = "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6"
  }
}
