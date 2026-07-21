package kz.voiceshield

import kotlin.math.abs
import kotlin.math.max

/** Lightweight 16 kHz mono cleanup that runs before ASR. It does not change the
 * Android audio route and deliberately keeps a conservative noise gate. */
internal class AudioPreprocessor {
  private var previousInput = 0f
  private var previousOutput = 0f
  private var noiseFloor = 0.008f
  var lastRms: Float = 0f
    private set
  var lastPeak: Float = 0f
    private set
  var lastSignalRatio: Float = 0f
    private set
  var lastClippingRatio: Float = 0f
    private set
  var lastSpeechLike: Boolean = false
    private set

  fun reset() {
    previousInput = 0f
    previousOutput = 0f
    noiseFloor = 0.008f
    lastRms = 0f
    lastPeak = 0f
    lastSignalRatio = 0f
    lastClippingRatio = 0f
    lastSpeechLike = false
  }

  fun process(input: ShortArray): ShortArray {
    if (input.isEmpty()) return input
    var peak = 0f
    val normalized = FloatArray(input.size)
    for (i in input.indices) {
      val sample = input[i] / 32768f
      // First-order high-pass filter removes DC and low-frequency handling noise.
      val filtered = sample - previousInput + 0.995f * previousOutput
      previousInput = sample
      previousOutput = filtered
      normalized[i] = filtered
      peak = max(peak, abs(filtered))
    }
    var meanSquare = 0f
    var clipping = 0
    var signalSamples = 0
    for (sample in normalized) meanSquare += sample * sample
    val rms = kotlin.math.sqrt(meanSquare / normalized.size)
    for (sample in normalized) {
      if (abs(sample) >= 0.98f) clipping += 1
      if (abs(sample) >= 0.012f) signalSamples += 1
    }
    lastRms = rms
    lastPeak = peak
    lastSignalRatio = signalSamples.toFloat() / normalized.size.toFloat()
    lastClippingRatio = clipping.toFloat() / normalized.size.toFloat()
    if (rms < noiseFloor * 1.4f) {
      noiseFloor = noiseFloor * 0.98f + rms * 0.02f
      lastSpeechLike = false
      return ShortArray(input.size)
    }
    noiseFloor = noiseFloor * 0.995f + rms * 0.005f
    lastSpeechLike = true
    val gain = (0.72f / max(peak, 0.08f)).coerceIn(0.65f, 3.0f)
    return ShortArray(input.size) { i -> (normalized[i] * gain).coerceIn(-1f, 1f).times(32767f).toInt().toShort() }
  }
}
