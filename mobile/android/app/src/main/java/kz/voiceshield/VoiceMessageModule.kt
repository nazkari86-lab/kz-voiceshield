package kz.voiceshield

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.File
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean

class VoiceMessageModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var pendingPromise: Promise? = null
  private var cloudAudioPromise: Promise? = null
  private val isTranscribing = AtomicBoolean(false)

  private val pickerListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode == PICK_AUDIO_REQUEST) {
        val promise = pendingPromise ?: return
        pendingPromise = null
        if (resultCode != Activity.RESULT_OK) {
          promise.reject("AUDIO_PICK_CANCELLED", "No audio file was selected")
          return
        }
        val uri = data?.data
        if (uri == null) {
          promise.reject("AUDIO_PICK_FAILED", "The selected audio could not be opened")
          return
        }
        transcribeUri(uri, promise)
        return
      }
      if (requestCode == PICK_AUDIO_URI_REQUEST) {
        val promise = cloudAudioPromise ?: return
        cloudAudioPromise = null
        if (resultCode != Activity.RESULT_OK) {
          promise.reject("AUDIO_PICK_CANCELLED", "No audio file was selected")
          return
        }
        val uri = data?.data
        if (uri == null) promise.reject("AUDIO_PICK_FAILED", "The selected audio could not be opened")
        else {
          runCatching { activity.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
          promise.resolve(uri.toString())
        }
      }
    }
  }

  init { context.addActivityEventListener(pickerListener) }

  override fun getName(): String = "VoiceMessageModule"
  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun pickAndTranscribe(language: String, promise: Promise) {
    openAudioPicker(language, false, promise)
  }

  @ReactMethod
  fun pickCallRecordingAndTranscribe(language: String, promise: Promise) {
    openAudioPicker(language, true, promise)
  }

  private fun openAudioPicker(language: String, callRecording: Boolean, promise: Promise) {
    if (pendingPromise != null) {
      promise.reject("VOICE_MSG_BUSY", "A transcription is already running")
      return
    }
    val activity = currentActivity
    if (activity == null) {
      promise.reject("ACTIVITY_UNAVAILABLE", "Open the application before selecting audio")
      return
    }
    pendingModelLanguage = language
    pendingPromise = promise
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "audio/*"
      putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("audio/*", "application/ogg", "application/octet-stream"))
      putExtra(Intent.EXTRA_TITLE, if (callRecording) "Select Xiaomi call recording" else "Select voice message")
    }
    activity.startActivityForResult(intent, PICK_AUDIO_REQUEST)
  }

  @ReactMethod
  fun transcribePendingAudio(language: String, promise: Promise) {
    if (isTranscribing.get()) {
      promise.reject("VOICE_MSG_BUSY", "A transcription is already running")
      return
    }
    val uri = pendingAudioUri ?: run { promise.resolve(null); return }
    pendingAudioUri = null
    transcribeUri(uri, promise, language)
  }

  @ReactMethod
  fun consumePendingAudio(promise: Promise) {
    val hasPending = pendingAudioUri != null
    promise.resolve(hasPending)
  }

  @ReactMethod
  fun pickAudioUri(promise: Promise) {
    if (cloudAudioPromise != null || pendingPromise != null) {
      promise.reject("VOICE_MSG_BUSY", "Another audio operation is already running")
      return
    }
    val activity = currentActivity
    if (activity == null) {
      promise.reject("ACTIVITY_UNAVAILABLE", "Open the application before selecting audio")
      return
    }
    cloudAudioPromise = promise
    activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
      type = "audio/*"
      putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("audio/*", "application/ogg", "application/octet-stream"))
    }, PICK_AUDIO_URI_REQUEST)
  }

  private fun transcribeUri(uri: Uri, promise: Promise, language: String = pendingModelLanguage) {
    if (!isTranscribing.compareAndSet(false, true)) {
      promise.reject("VOICE_MSG_BUSY", "A transcription is already running")
      return
    }
    scope.launch {
      try {
        val modelsDir = File(context.filesDir, "models")
        val selectedModel = context.getSharedPreferences(ModelDownloader.PREFS_NAME, 0)
          .getString(ModelDownloader.ACTIVE_WHISPER_MODEL, null)
        val modelFile = listOfNotNull(selectedModel, "ggml-small.bin", "ggml-tiny.bin")
          .map { File(modelsDir, it) }
          .firstOrNull { it.isFile && it.length() > 1_000_000L }
        if (modelFile == null) {
          promise.reject("MODEL_NOT_FOUND", "Download the Whisper model in Setup before transcribing voice messages.")
          return@launch
        }
        val startMs = System.currentTimeMillis()
        val pcm = decodeAudioToPcm16(uri, context)
        if (pcm.isEmpty()) {
          promise.reject(
            "AUDIO_DECODE_FAILED",
            "Could not decode this audio file. Supported formats: OGG/Opus, M4A, AAC, MP3, WAV."
          )
          return@launch
        }
        val transcript = if (modelFile.name.endsWith(".onnx", ignoreCase = true)) {
          val fastConformer = FastConformerContext(modelFile.absolutePath, context)
          try {
            fastConformer.transcribePcm(pcm)
          } finally {
            fastConformer.close()
          }
        } else {
          val whisper = WhisperContext(modelFile.absolutePath, language)
          try {
            whisper.transcribePcm(pcm)
          } finally {
            whisper.close()
          }
        }
        val result = Arguments.createMap()
        result.putString("transcript", transcript.trim())
        result.putDouble("durationMs", (System.currentTimeMillis() - startMs).toDouble())
        result.putInt("sampleCount", pcm.size)
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("TRANSCRIPTION_FAILED", e.message ?: "Unknown error during transcription", e)
      } finally {
        isTranscribing.set(false)
      }
    }
  }

  override fun invalidate() {
    pendingPromise?.reject("VOICE_MSG_CANCELLED", "Transcription was cancelled")
    pendingPromise = null
    cloudAudioPromise?.reject("VOICE_MSG_CANCELLED", "Audio selection was cancelled")
    cloudAudioPromise = null
    context.removeActivityEventListener(pickerListener)
    scope.cancel()
    super.invalidate()
  }

  companion object {
    private const val PICK_AUDIO_REQUEST = 4108
    private const val PICK_AUDIO_URI_REQUEST = 4109
    private const val TARGET_SAMPLE_RATE = 16_000
    private const val MAX_SAMPLES = TARGET_SAMPLE_RATE * 300 // 5 minutes

    @Volatile var pendingAudioUri: Uri? = null
    @Volatile private var pendingModelLanguage: String = "ru"

  fun decodeAudioToPcm16(uri: Uri, context: Context): ShortArray {
      val extractor = MediaExtractor()
      try {
        extractor.setDataSource(context, uri, null)
      } catch (e: Exception) {
        return shortArrayOf()
      }

      var audioTrack = -1
      var inputSampleRate = TARGET_SAMPLE_RATE
      var inputChannels = 1
      var mime = ""

      for (i in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(i)
        val trackMime = format.getString(MediaFormat.KEY_MIME) ?: continue
        if (trackMime.startsWith("audio/")) {
          audioTrack = i
          mime = trackMime
          inputSampleRate = try { format.getInteger(MediaFormat.KEY_SAMPLE_RATE) } catch (_: Exception) { TARGET_SAMPLE_RATE }
          inputChannels = try { format.getInteger(MediaFormat.KEY_CHANNEL_COUNT) } catch (_: Exception) { 1 }
          break
        }
      }
      if (audioTrack < 0 || mime.isEmpty()) {
        extractor.release()
        return shortArrayOf()
      }

      extractor.selectTrack(audioTrack)
      val format = extractor.getTrackFormat(audioTrack)

      val codec = try {
        MediaCodec.createDecoderByType(mime).also { it.configure(format, null, null, 0); it.start() }
      } catch (e: Exception) {
        extractor.release()
        return shortArrayOf()
      }

      val rawSamples = ShortAccumulator(TARGET_SAMPLE_RATE * 10)
      val info = MediaCodec.BufferInfo()
      var inputDone = false
      var outputSampleRate = inputSampleRate
      var outputChannels = inputChannels

      try {
        while (rawSamples.size < outputSampleRate * 300 * outputChannels) {
          if (!inputDone) {
            val inIndex = codec.dequeueInputBuffer(10_000L)
            if (inIndex >= 0) {
              val buf = codec.getInputBuffer(inIndex)
              if (buf != null) {
                buf.clear()
                val sampleSize = extractor.readSampleData(buf, 0)
                if (sampleSize < 0) {
                  codec.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                  inputDone = true
                } else {
                  codec.queueInputBuffer(inIndex, 0, sampleSize, extractor.sampleTime, 0)
                  extractor.advance()
                }
              }
            }
          }
          val outIndex = codec.dequeueOutputBuffer(info, 10_000L)
          if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            val outputFormat = codec.outputFormat
            outputSampleRate = outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            outputChannels = outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            continue
          }
          if (outIndex >= 0) {
            val outBuf = codec.getOutputBuffer(outIndex)
            if (outBuf != null && info.size > 0) {
              outBuf.position(info.offset)
              outBuf.limit(info.offset + info.size)
              val shortBuf = outBuf.slice().order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
              repeat(shortBuf.remaining()) {
                if (rawSamples.size < outputSampleRate * 300 * outputChannels) rawSamples.add(shortBuf.get())
              }
            }
            codec.releaseOutputBuffer(outIndex, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
          }
        }
      } finally {
        codec.stop()
        codec.release()
        extractor.release()
      }

      // Mix down to mono
      val decoded = rawSamples.toArray()
      val mono = if (outputChannels == 1) {
        decoded
      } else {
        ShortArray(decoded.size / outputChannels) { i ->
          (0 until outputChannels).sumOf { ch -> decoded[i * outputChannels + ch].toInt() }
            .div(outputChannels).toShort()
        }
      }

      // Resample to 16 kHz
      return if (outputSampleRate == TARGET_SAMPLE_RATE) mono else resampleLinear(mono, outputSampleRate)
    }

    private fun resampleLinear(input: ShortArray, fromRate: Int): ShortArray {
      if (input.isEmpty()) return shortArrayOf()
      val ratio = fromRate.toDouble() / TARGET_SAMPLE_RATE
      val outputLen = (input.size / ratio).toInt().coerceAtMost(MAX_SAMPLES)
      return ShortArray(outputLen) { i ->
        val pos = i * ratio
        val lo = pos.toInt().coerceIn(0, input.size - 1)
        val hi = (lo + 1).coerceIn(0, input.size - 1)
        val frac = pos - lo
        (input[lo] * (1.0 - frac) + input[hi] * frac).toInt().toShort()
      }
    }

    private class ShortAccumulator(initialCapacity: Int) {
      private var values = ShortArray(initialCapacity)
      var size = 0
        private set

      fun add(value: Short) {
        if (size == values.size) values = values.copyOf(values.size.coerceAtLeast(1) * 2)
        values[size++] = value
      }

      fun toArray(): ShortArray = values.copyOf(size)
    }
  }
}
