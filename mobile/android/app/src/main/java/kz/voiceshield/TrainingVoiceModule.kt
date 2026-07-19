package kz.voiceshield

import android.content.Intent
import android.content.pm.PackageManager
import android.Manifest
import android.speech.tts.TextToSpeech
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.media.MediaPlayer
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

class TrainingVoiceModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var engine: TextToSpeech? = null
  private var ready = false
  private var pending: (() -> Unit)? = null
  private var player: MediaPlayer? = null
  private var recognizer: SpeechRecognizer? = null

  override fun getName(): String = "TrainingVoiceModule"

  @ReactMethod
  fun speak(text: String, language: String, promise: Promise) {
    if (text.isBlank()) {
      promise.resolve(false)
      return
    }
    val start: () -> Unit = start@{
      val locale = if (language == "KZ") Locale("kk", "KZ") else Locale("ru", "RU")
      val tts = engine
      if (tts == null || !ready) {
        promise.reject("TTS_UNAVAILABLE", "Speech voice is not available on this device")
        return@start
      }
      val availability = tts.isLanguageAvailable(locale)
      if (availability < TextToSpeech.LANG_AVAILABLE) {
        promise.reject("TTS_LANGUAGE_UNAVAILABLE", "Install a $language speech voice in Android settings")
        return@start
      }
      tts.language = locale
      tts.setSpeechRate(0.92f)
      promise.resolve(tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "voiceshield-training"))
    }
    if (engine == null) {
      pending = start
      engine = TextToSpeech(context) { status ->
        ready = status == TextToSpeech.SUCCESS
        pending?.invoke()
        pending = null
      }
    } else {
      start()
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    engine?.stop()
    recognizer?.run {
      cancel()
      destroy()
    }
    recognizer = null
    player?.run {
      if (isPlaying) stop()
      reset()
      release()
    }
    player = null
    promise.resolve(null)
  }

  @ReactMethod
  fun listen(language: String, promise: Promise) {
    if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("MICROPHONE_PERMISSION_REQUIRED", "Allow microphone access in VoiceShield Setup before speaking an answer")
      return
    }
    try {
      if (!SpeechRecognizer.isRecognitionAvailable(context)) {
        promise.reject("SPEECH_RECOGNITION_UNAVAILABLE", "Speech recognition is not available on this device")
        return
      }
      recognizer?.run {
        cancel()
        destroy()
      }
      val next = SpeechRecognizer.createSpeechRecognizer(context)
      recognizer = next
      var settled = false
      fun close() {
        next.destroy()
        if (recognizer === next) recognizer = null
      }
      next.setRecognitionListener(object : RecognitionListener {
        override fun onResults(results: android.os.Bundle?) {
          if (settled) return
          settled = true
          val values = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
          promise.resolve(values?.firstOrNull().orEmpty())
          close()
        }
        override fun onError(error: Int) {
          if (settled) return
          settled = true
          promise.reject("SPEECH_RECOGNITION_FAILED", "Could not recognise the training answer (code $error)")
          close()
        }
        override fun onReadyForSpeech(params: android.os.Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onPartialResults(partialResults: android.os.Bundle?) {}
        override fun onEvent(eventType: Int, params: android.os.Bundle?) {}
      })
      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, if (language == "KZ") "kk-KZ" else "ru-RU")
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
      }
      next.startListening(intent)
    } catch (error: Exception) {
      recognizer?.destroy()
      recognizer = null
      promise.reject("SPEECH_RECOGNITION_FAILED", "Could not start microphone recognition safely", error)
    }
  }

  @ReactMethod
  fun playBase64(audioBase64: String, mimeType: String?, promise: Promise) {
    if (audioBase64.isBlank()) {
      promise.reject("AUDIO_EMPTY", "Training audio is empty")
      return
    }
    try {
      val bytes = Base64.decode(audioBase64, Base64.DEFAULT)
      val file = java.io.File.createTempFile("voiceshield-training-", ".mp3", context.cacheDir)
      file.outputStream().use { it.write(bytes) }
      player?.run {
        if (isPlaying) stop()
        reset()
        release()
      }
      val next = MediaPlayer()
      player = next
      next.setDataSource(file.absolutePath)
      next.setOnCompletionListener { completed ->
        completed.release()
        if (player === completed) player = null
        file.delete()
      }
      next.setOnErrorListener { failed, _, _ ->
        failed.release()
        if (player === failed) player = null
        file.delete()
        promise.reject("AUDIO_PLAYBACK_FAILED", "Training audio could not be decoded")
        true
      }
      next.setOnPreparedListener { prepared ->
        prepared.start()
        promise.resolve(true)
      }
      next.prepareAsync()
    } catch (error: Exception) {
      promise.reject("AUDIO_PLAYBACK_FAILED", error.message, error)
    }
  }

  override fun invalidate() {
    engine?.stop()
    engine?.shutdown()
    engine = null
    player?.run {
      if (isPlaying) stop()
      reset()
      release()
    }
    player = null
    recognizer?.destroy()
    recognizer = null
    super.invalidate()
  }
}
