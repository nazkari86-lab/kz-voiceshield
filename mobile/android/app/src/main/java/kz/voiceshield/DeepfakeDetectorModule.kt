package kz.voiceshield

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.sqrt

/**
 * Optional on-device AASIST evidence module.
 *
 * The module is deliberately not called from the Live Shield lifecycle. It
 * scores an explicit frame copy and returns a probability-like spoof signal;
 * rules remain the only live risk authority until telephone calibration and a
 * physical Xiaomi benchmark are complete.
 */
class DeepfakeDetectorModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "DeepfakeDetectorModule"

  private val executor: ExecutorService = Executors.newSingleThreadExecutor()
  private val lock = Any()
  private var environment: OrtEnvironment? = null
  private var session: OrtSession? = null
  private var modelLoaded = false
  private val recentScores = ArrayDeque<Float>()

  @ReactMethod
  fun loadModel(modelPath: String?, promise: Promise) {
    executor.execute {
      try {
        val path = resolveModelPath(modelPath, "aasist.onnx")
        synchronized(lock) {
          session?.close()
          environment = OrtEnvironment.getEnvironment()
          session = environment!!.createSession(path, OrtSession.SessionOptions())
          val input = session!!.inputNames.firstOrNull()
          if (input != "wav") throw IllegalStateException("Unexpected AASIST input: $input")
          modelLoaded = true
        }
        promise.resolve(true)
      } catch (error: Throwable) {
        synchronized(lock) { modelLoaded = false; session?.close(); session = null }
        promise.resolve(false)
      }
    }
  }

  @ReactMethod
  fun analyzeFrame(samplesArray: ReadableArray, sampleRate: Int, promise: Promise) {
    val samples = FloatArray(samplesArray.size().coerceAtMost(MAX_FRAME_SAMPLES)) { samplesArray.getDouble(it).toFloat() }
    executor.execute {
      try {
        val result = synchronized(lock) {
          if (modelLoaded && session != null && environment != null) scoreAasist(samples, sampleRate) else heuristicDeepfake(samples, sampleRate)
        }
        synchronized(lock) {
          if (recentScores.size >= 10) recentScores.removeFirst()
          recentScores.addLast(result)
        }
        promise.resolve(synchronized(lock) { recentScores.average() })
      } catch (error: Throwable) {
        promise.reject("DEEPFAKE_ERROR", error)
      }
    }
  }

  @ReactMethod
  fun reset(promise: Promise) {
    synchronized(lock) { recentScores.clear() }
    promise.resolve(null)
  }

  @ReactMethod
  fun isModelLoaded(promise: Promise) {
    promise.resolve(synchronized(lock) { modelLoaded })
  }

  override fun invalidate() {
    synchronized(lock) {
      modelLoaded = false
      session?.close()
      session = null
    }
    executor.shutdownNow()
    super.invalidate()
  }

  private fun scoreAasist(samples: FloatArray, sampleRate: Int): Float {
    val waveform = prepareWaveform(samples, sampleRate)
    val env = environment ?: error("AASIST runtime unavailable")
    val activeSession = session ?: error("AASIST session unavailable")
    OnnxTensor.createTensor(env, arrayOf(waveform)).use { tensor ->
      activeSession.run(mapOf("wav" to tensor)).use { outputs ->
        val value = outputs[0].value
        val logits = when (value) {
          is Array<*> -> (value[0] as? FloatArray) ?: error("Unexpected AASIST output row")
          is FloatArray -> value
          else -> error("Unexpected AASIST output type")
        }
        if (logits.size != 2) error("Unexpected AASIST output size: ${logits.size}")
        val max = maxOf(logits[0], logits[1])
        val p0 = exp((logits[0] - max).toDouble())
        val p1 = exp((logits[1] - max).toDouble())
        return (p0 / (p0 + p1)).toFloat().coerceIn(0f, 1f)
      }
    }
  }

  private fun prepareWaveform(samples: FloatArray, sampleRate: Int): FloatArray {
    require(sampleRate > 0) { "sampleRate must be positive" }
    val resampled = if (sampleRate == TARGET_SAMPLE_RATE) samples else resample(samples, sampleRate, TARGET_SAMPLE_RATE)
    val output = FloatArray(WINDOW_SAMPLES)
    resampled.copyInto(output, endIndex = minOf(resampled.size, WINDOW_SAMPLES))
    return output
  }

  private fun resample(input: FloatArray, from: Int, to: Int): FloatArray {
    if (input.isEmpty()) return FloatArray(0)
    val size = maxOf(1, (input.size.toLong() * to / from).toInt())
    return FloatArray(size) { index ->
      val position = index.toDouble() * (input.size - 1) / maxOf(1, size - 1)
      val left = position.toInt().coerceIn(0, input.lastIndex)
      val right = (left + 1).coerceAtMost(input.lastIndex)
      (input[left] + (input[right] - input[left]) * (position - left).toFloat()).coerceIn(-1f, 1f)
    }
  }

  private fun resolveModelPath(requested: String?, assetName: String): String {
    val requestedFile = requested?.takeIf { it.isNotBlank() }?.let(::File)
    if (requestedFile?.isFile == true) return requestedFile.absolutePath
    return VoiceModelAssets.copyVerified(context, assetName, assetName, AASIST_BYTES, AASIST_SHA256)
  }

  private fun heuristicDeepfake(samples: FloatArray, sampleRate: Int): Float {
    if (samples.size < 128) return 0f
    val n = minOf(samples.size, 512)
    val magnitudes = FloatArray(n / 2)
    for (k in magnitudes.indices) {
      var re = 0.0; var im = 0.0
      for (t in 0 until n) {
        val angle = 2.0 * Math.PI * k * t / n
        re += samples[t] * kotlin.math.cos(angle)
        im += samples[t] * kotlin.math.sin(angle)
      }
      magnitudes[k] = sqrt((re * re + im * im).toFloat())
    }
    val nonZero = magnitudes.filter { it > 1e-8f }
    if (nonZero.isEmpty()) return 0f
    val geometricMean = exp(nonZero.sumOf { ln(it.toDouble()) } / nonZero.size)
    val arithmeticMean = nonZero.average()
    val sfm = if (arithmeticMean > 0) (geometricMean / arithmeticMean).toFloat() else 0f
    val sfmScore = when { sfm > 0.75f -> 0.8f; sfm > 0.6f -> 0.5f; sfm > 0.45f -> 0.25f; else -> 0f }
    val lag = (sampleRate * 0.008).toInt().coerceAtLeast(1)
    var autocorr = 0.0; var norm = 0.0
    for (i in 0 until minOf(samples.size - lag, 256)) { autocorr += samples[i] * samples[i + lag]; norm += samples[i] * samples[i] }
    val periodicity = if (norm > 0 && autocorr / norm > 0.9) 0.4f else 0f
    return (sfmScore * 0.7f + periodicity * 0.3f).coerceIn(0f, 1f)
  }

  companion object {
    private const val TARGET_SAMPLE_RATE = 16_000
    private const val WINDOW_SAMPLES = 64_600
    private const val MAX_FRAME_SAMPLES = 1_000_000
    private const val AASIST_BYTES = 1_615_195L
    private const val AASIST_SHA256 = "130e536266b7c537f9a13029e1612a9f392fd1cc827783683b6d1c062a3db5e1"
  }
}
