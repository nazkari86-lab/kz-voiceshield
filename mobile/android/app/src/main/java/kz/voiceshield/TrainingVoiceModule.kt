package kz.voiceshield

import android.speech.tts.TextToSpeech
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

class TrainingVoiceModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var engine: TextToSpeech? = null
  private var ready = false
  private var pending: (() -> Unit)? = null

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
    promise.resolve(null)
  }

  override fun invalidate() {
    engine?.stop()
    engine?.shutdown()
    engine = null
    super.invalidate()
  }
}
