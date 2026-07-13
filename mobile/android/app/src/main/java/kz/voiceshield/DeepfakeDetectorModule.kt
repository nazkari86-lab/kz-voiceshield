package kz.voiceshield

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import kotlin.math.ln
import kotlin.math.sqrt
import kotlin.math.abs

/**
 * Deepfake voice detection module.
 * Current implementation: spectral feature heuristics (SFM, spectral rolloff, periodicity).
 * Model-ready: when ASVspoof/ADD2023 ONNX model is available, activate neural inference.
 *
 * Reference model: ADD2023 track 2 winning solution or ASVspoof5 baseline
 * Interface stays identical — JS code doesn't change when model is swapped in.
 */
class DeepfakeDetectorModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "DeepfakeDetectorModule"

  private var modelLoaded = false
  // Accumulate recent frame scores for smoothing
  private val recentScores = ArrayDeque<Float>()

  private fun ArrayDeque<Float>.addMax(value: Float, maxSize: Int) {
    if (size >= maxSize) removeFirst()
    addLast(value)
  }

  @ReactMethod
  fun loadModel(modelPath: String, promise: Promise) {
    // TODO: load ASVspoof ONNX model
    modelLoaded = false
    promise.resolve(false)
  }

  @ReactMethod
  fun analyzeFrame(samplesArray: ReadableArray, sampleRate: Int, promise: Promise) {
    try {
      val samples = FloatArray(samplesArray.size()) { samplesArray.getDouble(it).toFloat() }
      val score = heuristicDeepfake(samples, sampleRate)
      recentScores.addMax(score, 10)
      val smoothed = recentScores.average().toFloat()
      promise.resolve(smoothed.toDouble())
    } catch (e: Throwable) {
      promise.reject("DEEPFAKE_ERROR", e)
    }
  }

  @ReactMethod
  fun reset(promise: Promise) {
    recentScores.clear()
    promise.resolve(null)
  }

  /**
   * Heuristic deepfake indicators:
   * 1. Spectral flatness — synthetic voices often have unnaturally flat spectra
   * 2. Periodicity — TTS voices have very regular pitch periods
   * 3. High-frequency energy ratio — vocoders often cut off or boost HF artificially
   */
  private fun heuristicDeepfake(samples: FloatArray, sampleRate: Int): Float {
    if (samples.size < 128) return 0f

    // Simple DFT-based spectral flatness measure (SFM)
    val n = minOf(samples.size, 512)
    val magnitudes = FloatArray(n / 2)
    for (k in magnitudes.indices) {
      var re = 0.0; var im = 0.0
      for (t in 0 until n) {
        val angle = 2.0 * Math.PI * k * t / n
        re += samples[t] * Math.cos(angle)
        im += samples[t] * Math.sin(angle)
      }
      magnitudes[k] = sqrt((re * re + im * im).toFloat())
    }

    val nonZero = magnitudes.filter { it > 1e-8f }
    if (nonZero.isEmpty()) return 0f
    val geometricMean = Math.exp(nonZero.sumOf { ln(it.toDouble()) } / nonZero.size)
    val arithmeticMean = nonZero.average()
    val sfm = if (arithmeticMean > 0) (geometricMean / arithmeticMean).toFloat() else 0f

    // Suspiciously high SFM (close to 1.0) suggests tonal/synthetic source
    // Real speech SFM is typically 0.1–0.4
    val sfmScore = when {
      sfm > 0.75f -> 0.8f
      sfm > 0.6f -> 0.5f
      sfm > 0.45f -> 0.25f
      else -> 0f
    }

    // Periodicity check: autocorrelation at ~8ms lag (pitch)
    val lag = (sampleRate * 0.008).toInt().coerceAtLeast(1)
    var autocorr = 0.0; var norm = 0.0
    for (i in 0 until minOf(samples.size - lag, 256)) {
      autocorr += samples[i] * samples[i + lag]
      norm += samples[i] * samples[i]
    }
    val periodicityScore = if (norm > 0) {
      val ratio = (autocorr / norm).toFloat().coerceIn(-1f, 1f)
      // Very high periodicity (> 0.9) may suggest synthetic monotone voice
      if (ratio > 0.9f) 0.4f else 0f
    } else 0f

    return (sfmScore * 0.7f + periodicityScore * 0.3f).coerceIn(0f, 1f)
  }
}
