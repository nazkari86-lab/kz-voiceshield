package kz.voiceshield

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import java.io.File

/**
 * On-device LLM inference using MediaPipe Tasks GenAI 0.10.14.
 * Model: Gemma 3 1B IT INT4 (~670MB .task file)
 *
 * MediaPipe 0.10.14 API: generateResponseAsync(prompt) fires result through
 * the ProgressListener set once on LlmInferenceOptions at loadModel time.
 *
 * Events emitted:
 *   VS_LLM_TOKEN  — partial token string (streaming)
 *   VS_LLM_DONE   — full response string
 *   VS_LLM_ERROR  — error message
 */
class LLMInferenceModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "LLMInferenceModule"

  private var inference: LlmInference? = null
  @Volatile private var isGenerating = false
  @Volatile private var currentPromise: Promise? = null
  private val fullBuilder = StringBuilder()

  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun isReady(promise: Promise) {
    promise.resolve(inference != null)
  }

  @ReactMethod
  fun loadModel(modelPath: String, maxTokens: Int, promise: Promise) {
    Thread {
      try {
        val file = File(modelPath)
        if (!file.exists()) {
          promise.reject("MODEL_NOT_FOUND", "Model file not found: $modelPath")
          return@Thread
        }
        inference?.close()
        inference = null

        val options = LlmInference.LlmInferenceOptions.builder()
          .setModelPath(modelPath)
          .setMaxTokens(maxTokens.coerceIn(256, 2048))
          .setTopK(40)
          .setTemperature(0.7f)
          .setRandomSeed(42)
          .setResultListener { partialResult, done ->
            if (partialResult != null) {
              fullBuilder.append(partialResult)
              emit("VS_LLM_TOKEN", partialResult)
            }
            if (done) {
              isGenerating = false
              val full = fullBuilder.toString()
              emit("VS_LLM_DONE", full)
              currentPromise?.resolve(full)
              currentPromise = null
            }
          }
          .build()

        inference = LlmInference.createFromOptions(reactContext, options)
        promise.resolve(true)
      } catch (e: Throwable) {
        promise.reject("LLM_LOAD_ERROR", e.message ?: "Failed to load model", e)
      }
    }.start()
  }

  @ReactMethod
  fun generateResponse(prompt: String, promise: Promise) {
    val llm = inference
    if (llm == null) {
      promise.reject("LLM_NOT_READY", "Model not loaded. Call loadModel() first.")
      return
    }
    if (isGenerating) {
      promise.reject("LLM_BUSY", "Generation already in progress")
      return
    }
    isGenerating = true
    fullBuilder.clear()
    currentPromise = promise
    try {
      llm.generateResponseAsync(prompt)
    } catch (e: Throwable) {
      isGenerating = false
      currentPromise = null
      val msg = e.message ?: "Generation failed"
      emit("VS_LLM_ERROR", msg)
      promise.reject("LLM_GENERATE_ERROR", msg, e)
    }
  }

  @ReactMethod
  fun cancelGeneration(promise: Promise) {
    isGenerating = false
    currentPromise?.reject("LLM_CANCELLED", "Generation cancelled")
    currentPromise = null
    promise.resolve(null)
  }

  @ReactMethod
  fun unloadModel(promise: Promise) {
    try {
      inference?.close()
      inference = null
      promise.resolve(null)
    } catch (e: Throwable) {
      promise.reject("LLM_UNLOAD_ERROR", e)
    }
  }

  private fun emit(event: String, payload: String) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, payload)
  }

  @Suppress("OVERRIDE_DEPRECATION")
  override fun onCatalystInstanceDestroy() {
    inference?.close()
    inference = null
  }
}
