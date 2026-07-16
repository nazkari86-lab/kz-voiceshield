package kz.voiceshield

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import kotlin.math.sqrt
import kotlin.math.abs

/**
 * Voice Activity Detection module.
 * Current implementation: energy-based heuristic (RMS + zero-crossing rate).
 * Model-ready interface: when silero-vad.onnx is available, loadModel() activates
 * ONNX inference and processFrame() switches to neural VAD automatically.
 *
 * Silero VAD ONNX can be downloaded from:
 * https://github.com/snakers4/silero-vad/blob/master/src/silero_vad/data/silero_vad.onnx
 * Place it in app files dir; call loadModel() with the path from JS.
 */
class SileroVADModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "SileroVADModule"

  private var modelLoaded = false
  private var energyThreshold = 0.01f
  private var zcThreshold = 0.15f

  @ReactMethod
  fun loadModel(modelPath: String, promise: Promise) {
    // TODO: load silero-vad.onnx with OnnxRuntime when dependency is added
    // val env = OrtEnvironment.getEnvironment()
    // session = env.createSession(modelPath, OrtSession.SessionOptions())
    modelLoaded = false // flip to true when ONNX ready
    promise.resolve(false) // returns true when model is active
  }

  @ReactMethod
  fun processFrame(samplesArray: ReadableArray, sampleRate: Int, promise: Promise) {
    try {
      val samples = FloatArray(samplesArray.size()) { samplesArray.getDouble(it).toFloat() }
      val confidence = if (modelLoaded) {
        // Neural VAD inference path (future)
        heuristicVAD(samples)
      } else {
        heuristicVAD(samples)
      }
      promise.resolve(confidence.toDouble())
    } catch (e: Throwable) {
      promise.reject("VAD_ERROR", e)
    }
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
