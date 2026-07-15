package kz.voiceshield

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.k2fsa.sherpa.onnx.SileroVadModelConfig
import com.k2fsa.sherpa.onnx.Vad
import com.k2fsa.sherpa.onnx.VadModelConfig
import java.io.File
import java.io.FileOutputStream
import kotlin.math.sqrt

/**
 * Voice Activity Detection module.
 * Uses the bundled Silero ONNX model through the sherpa-onnx runtime. The energy
 * heuristic remains a fail-soft fallback for devices where native model loading
 * fails; it is never presented as neural confidence.
 *
 * Silero VAD ONNX can be downloaded from:
 * https://github.com/snakers4/silero-vad/blob/master/src/silero_vad/data/silero_vad.onnx
 * The bundled asset can be activated with loadBundledModel().
 */
class SileroVADModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "SileroVADModule"

  private var modelLoaded = false
  private var vad: Vad? = null
  private var energyThreshold = 0.01f
  private var zcThreshold = 0.15f

  @ReactMethod
  fun loadModel(modelPath: String, promise: Promise) {
    try {
      val file = File(modelPath)
      require(file.isFile && file.length() > 0) { "Silero VAD model was not found: $modelPath" }
      vad?.release()
      vad = VadModelConfig.builder()
        .setSampleRate(16000)
        .setNumThreads(1)
        .setDebug(false)
        .setProvider("cpu")
        .setSileroVadModelConfig(
          SileroVadModelConfig.builder()
            .setModel(file.absolutePath)
            .setThreshold(0.5f)
            .setMinSilenceDuration(0.25f)
            .setMinSpeechDuration(0.1f)
            .setWindowSize(512)
            .build()
        )
        .build()
        .let(::Vad)
      modelLoaded = true
      promise.resolve(true)
    } catch (error: Throwable) {
      vad?.release()
      vad = null
      modelLoaded = false
      promise.reject("VAD_MODEL_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun loadBundledModel(promise: Promise) {
    try {
      val target = File(reactApplicationContext.filesDir, "models/silero_vad.onnx")
      if (!target.isFile || target.length() == 0L) {
        target.parentFile?.mkdirs()
        reactApplicationContext.assets.open("silero_vad.onnx").use { input ->
          FileOutputStream(target).use { output -> input.copyTo(output) }
        }
      }
      loadModel(target.absolutePath, promise)
    } catch (error: Throwable) {
      promise.reject("VAD_ASSET_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun processFrame(samplesArray: ReadableArray, sampleRate: Int, promise: Promise) {
    try {
      val samples = FloatArray(samplesArray.size()) { samplesArray.getDouble(it).toFloat() }
      val confidence = if (modelLoaded && vad != null && sampleRate == 16000) {
        vad!!.compute(samples).coerceIn(0f, 1f)
      } else heuristicVAD(samples)
      promise.resolve(confidence.toDouble())
    } catch (e: Throwable) {
      promise.reject("VAD_ERROR", e)
    }
  }

  @ReactMethod
  fun reset(promise: Promise) {
    vad?.reset()
    promise.resolve(null)
  }

  @ReactMethod
  fun isModelLoaded(promise: Promise) {
    promise.resolve(modelLoaded)
  }

  @ReactMethod
  fun setThresholds(energy: Double, zcr: Double, promise: Promise) {
    energyThreshold = energy.toFloat()
    zcThreshold = zcr.toFloat()
    promise.resolve(null)
  }

  private fun heuristicVAD(samples: FloatArray): Float {
    if (samples.isEmpty()) return 0f
    // RMS energy
    val rms = sqrt(samples.map { it * it }.average().toFloat())
    // Zero-crossing rate
    var crossings = 0
    for (i in 1 until samples.size) {
      if ((samples[i] >= 0) != (samples[i - 1] >= 0)) crossings++
    }
    val zcr = crossings.toFloat() / samples.size

    // Voice has moderate energy and ZCR (not pure noise, not silence)
    val energyScore = (rms / (energyThreshold * 5)).coerceIn(0f, 1f)
    val zcrScore = if (zcr in 0.05f..0.4f) 1f else 0.3f
    return (energyScore * 0.7f + zcrScore * 0.3f).coerceIn(0f, 1f)
  }
}
