package kz.voiceshield

import android.content.Context
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineNemoEncDecCtcModelConfig
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import java.io.File

/** Local KZ/RU FastConformer CTC recognizer backed by sherpa-onnx. */
class FastConformerContext(modelPath: String, context: Context) : AutoCloseable {
  private val recognizer: OfflineRecognizer
  private var bufferedPcm = ShortArray(0)

  init {
    val model = File(modelPath)
    require(model.isFile) { "FastConformer model was not found" }
    val tokens = File(model.parentFile, ModelDownloader.FASTCONFORMER_TOKENS_FILE)
    if (!tokens.isFile || tokens.length() != TOKENS_BYTES) {
      context.assets.open(ModelDownloader.FASTCONFORMER_TOKENS_FILE).use { input ->
        tokens.outputStream().use { output -> input.copyTo(output) }
      }
    }
    require(tokens.isFile) { "FastConformer vocabulary was not found" }

    val nemo = OfflineNemoEncDecCtcModelConfig.builder()
      .setModel(model.absolutePath)
      .build()
    val modelConfig = OfflineModelConfig.builder()
      .setNemo(nemo)
      .setTokens(tokens.absolutePath)
      .setNumThreads(2)
      .setDebug(false)
      .build()
    recognizer = OfflineRecognizer(
      OfflineRecognizerConfig.builder()
        .setOfflineModelConfig(modelConfig)
        .setDecodingMethod("greedy_search")
        .build()
    )
  }

  @Synchronized
  fun process(chunk: ShortArray) {
    if (chunk.isEmpty()) return
    // Keep at most four seconds for a bounded live-call latency and memory use.
    val maxSamples = 64_000
    val source = if (bufferedPcm.size + chunk.size > maxSamples) {
      bufferedPcm.copyOfRange((bufferedPcm.size + chunk.size - maxSamples).coerceAtLeast(0), bufferedPcm.size)
    } else {
      bufferedPcm
    }
    bufferedPcm = ShortArray(source.size + chunk.size).also {
      source.copyInto(it)
      chunk.copyInto(it, source.size)
    }
  }

  @Synchronized
  fun transcribe(): String {
    val pcm = bufferedPcm
    bufferedPcm = ShortArray(0)
    return decode(pcm)
  }

  @Synchronized
  fun transcribePcm(pcm: ShortArray): String = decode(pcm)

  @Synchronized fun reset() { bufferedPcm = ShortArray(0) }
  @Synchronized fun bufferSize(): Int = bufferedPcm.size

  private fun decode(pcm: ShortArray): String {
    if (pcm.isEmpty()) return ""
    val samples = FloatArray(pcm.size) { index -> pcm[index] / 32768.0f }
    val stream = recognizer.createStream()
    return try {
      stream.acceptWaveform(samples, SAMPLE_RATE)
      recognizer.decode(stream)
      recognizer.getResult(stream).text
    } finally {
      stream.release()
    }
  }

  override fun close() { recognizer.release() }

  private companion object {
    const val SAMPLE_RATE = 16_000
    const val TOKENS_BYTES = 15_366L
  }
}
