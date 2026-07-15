package kz.voiceshield

import android.app.ActivityManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Message
import android.os.Messenger
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

/**
 * React Native bridge for the isolated Gemma process.
 *
 * MediaPipe uses native code that can terminate a process with SIGABRT or
 * SIGILL before Kotlin can catch an exception. All MediaPipe calls therefore
 * live in GemmaInferenceService (:gemma), while this module only performs IPC.
 */
class LLMInferenceModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "LLMInferenceModule"

  @Volatile private var serviceMessenger: Messenger? = null
  @Volatile private var isBound = false
  @Volatile private var inferenceReady = false
  private var pendingLoad: LoadRequest? = null
  private var pendingUnload: Promise? = null
  private var currentPromise: Promise? = null

  private val replyMessenger = Messenger(Handler(Looper.getMainLooper()) { message ->
    handleServiceMessage(message)
    true
  })

  private val serviceConnection = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName, binder: IBinder) {
      serviceMessenger = Messenger(binder)
      sendPendingLoad()
    }

    override fun onServiceDisconnected(name: ComponentName) {
      serviceMessenger = null
      unbindServiceSafely()
      handleEngineStopped(ENGINE_STOPPED_MESSAGE)
    }

    override fun onBindingDied(name: ComponentName) {
      serviceMessenger = null
      unbindServiceSafely()
      handleEngineStopped(ENGINE_STOPPED_MESSAGE)
    }

    override fun onNullBinding(name: ComponentName) {
      serviceMessenger = null
      unbindServiceSafely()
      handleEngineStopped("Gemma engine could not be started on this device.")
    }
  }

  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun isReady(promise: Promise) {
    promise.resolve(inferenceReady && serviceMessenger != null)
  }

  @ReactMethod
  fun loadModel(modelPath: String, maxTokens: Int, promise: Promise) {
    GemmaRuntimePolicy.unsupportedReason(totalRamBytes())?.let { reason ->
      promise.reject("LLM_DEVICE_UNSUPPORTED", reason)
      return
    }
    if (!File(modelPath).isFile) {
      promise.reject("MODEL_NOT_FOUND", "Model file not found: $modelPath")
      return
    }
    synchronized(this) {
      if (pendingLoad != null) {
        promise.reject("LLM_BUSY", "Gemma is already loading")
        return
      }
      if (maxTokens != GemmaRuntimePolicy.CONTEXT_TOKENS) {
        emit("VS_LLM_WARNING", "Gemma context corrected to ${GemmaRuntimePolicy.CONTEXT_TOKENS} tokens")
      }
      inferenceReady = false
      pendingLoad = LoadRequest(modelPath, promise)
    }

    if (serviceMessenger != null) {
      sendPendingLoad()
    } else {
      bindService()
    }
  }

  @ReactMethod
  fun generateResponse(prompt: String, promise: Promise) {
    val target = serviceMessenger
    if (!inferenceReady || target == null) {
      promise.reject("LLM_NOT_READY", "Gemma is not loaded. Start the model first.")
      return
    }
    synchronized(this) {
      if (currentPromise != null) {
        promise.reject("LLM_BUSY", "Generation already in progress")
        return
      }
      currentPromise = promise
    }
    sendCommand(target, GemmaServiceProtocol.COMMAND_GENERATE, Bundle().apply {
      putString(GemmaServiceProtocol.KEY_PROMPT, prompt)
    })
  }

  @ReactMethod
  fun cancelGeneration(promise: Promise) {
    serviceMessenger?.let { sendCommand(it, GemmaServiceProtocol.COMMAND_CANCEL) }
    synchronized(this) {
      currentPromise.also { currentPromise = null }
    }?.reject("LLM_CANCELLED", "Generation cancelled")
    promise.resolve(null)
  }

  @ReactMethod
  fun unloadModel(promise: Promise) {
    inferenceReady = false
    synchronized(this) {
      currentPromise.also { currentPromise = null }
    }?.reject("LLM_UNLOADED", "Model unloaded")

    val target = serviceMessenger
    if (target == null) {
      unbindServiceSafely()
      promise.resolve(null)
      return
    }
    synchronized(this) {
      pendingUnload?.resolve(null)
      pendingUnload = promise
    }
    sendCommand(target, GemmaServiceProtocol.COMMAND_UNLOAD)
  }

  private fun bindService() {
    if (isBound) return
    val intent = Intent(reactContext, GemmaInferenceService::class.java)
    val bound = reactContext.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
    isBound = bound
    if (!bound) handleEngineStopped("Gemma engine service is unavailable.")
  }

  private fun sendPendingLoad() {
    val target = serviceMessenger ?: return
    val request = synchronized(this) { pendingLoad } ?: return
    sendCommand(target, GemmaServiceProtocol.COMMAND_LOAD, Bundle().apply {
      putString(GemmaServiceProtocol.KEY_MODEL_PATH, request.modelPath)
      putInt(GemmaServiceProtocol.KEY_MAX_TOKENS, GemmaRuntimePolicy.CONTEXT_TOKENS)
    })
  }

  private fun sendCommand(target: Messenger, what: Int, data: Bundle = Bundle()) {
    try {
      Message.obtain(null, what).also { message ->
        message.replyTo = replyMessenger
        message.data = data
        target.send(message)
      }
    } catch (_: Throwable) {
      serviceMessenger = null
      unbindServiceSafely()
      handleEngineStopped(ENGINE_STOPPED_MESSAGE)
    }
  }

  private fun handleServiceMessage(message: Message) {
    when (message.what) {
      GemmaServiceProtocol.RESPONSE_LOAD_OK -> {
        val request = synchronized(this) {
          inferenceReady = true
          pendingLoad.also { pendingLoad = null }
        }
        request?.promise?.resolve(true)
      }
      GemmaServiceProtocol.RESPONSE_TOKEN -> {
        emit("VS_LLM_TOKEN", message.data.getString(GemmaServiceProtocol.KEY_TEXT).orEmpty())
      }
      GemmaServiceProtocol.RESPONSE_DONE -> {
        val response = message.data.getString(GemmaServiceProtocol.KEY_TEXT).orEmpty()
        val promise = synchronized(this) {
          currentPromise.also { currentPromise = null }
        }
        emit("VS_LLM_DONE", response)
        promise?.resolve(response)
      }
      GemmaServiceProtocol.RESPONSE_ERROR -> handleServiceError(message.data)
      GemmaServiceProtocol.RESPONSE_UNLOAD_OK -> {
        val promise = synchronized(this) {
          pendingUnload.also { pendingUnload = null }
        }
        unbindServiceSafely()
        promise?.resolve(null)
      }
    }
  }

  private fun handleServiceError(data: Bundle) {
    val request = data.getInt(GemmaServiceProtocol.KEY_REQUEST)
    val code = data.getString(GemmaServiceProtocol.KEY_ERROR_CODE).orEmpty().ifBlank { "LLM_ERROR" }
    val errorMessage = data.getString(GemmaServiceProtocol.KEY_ERROR_MESSAGE).orEmpty().ifBlank { "Gemma operation failed" }
    when (request) {
      GemmaServiceProtocol.COMMAND_LOAD -> {
        inferenceReady = false
        val load = synchronized(this) { pendingLoad.also { pendingLoad = null } }
        load?.promise?.reject(code, errorMessage)
      }
      GemmaServiceProtocol.COMMAND_GENERATE -> {
        val promise = synchronized(this) { currentPromise.also { currentPromise = null } }
        emit("VS_LLM_ERROR", errorMessage)
        promise?.reject(code, errorMessage)
      }
      GemmaServiceProtocol.COMMAND_UNLOAD -> {
        val promise = synchronized(this) { pendingUnload.also { pendingUnload = null } }
        unbindServiceSafely()
        promise?.reject(code, errorMessage)
      }
    }
  }

  private fun handleEngineStopped(message: String) {
    val load = synchronized(this) { pendingLoad.also { pendingLoad = null } }
    val generation = synchronized(this) { currentPromise.also { currentPromise = null } }
    val unload = synchronized(this) { pendingUnload.also { pendingUnload = null } }
    val wasReady = inferenceReady
    inferenceReady = false
    load?.promise?.reject("LLM_ENGINE_CRASHED", message)
    generation?.reject("LLM_ENGINE_CRASHED", message)
    unload?.resolve(null)
    if (wasReady || generation != null) emit("VS_LLM_STOPPED", message)
  }

  private fun unbindServiceSafely() {
    if (!isBound) return
    try {
      reactContext.unbindService(serviceConnection)
    } catch (_: IllegalArgumentException) {
      // The system may already have removed a crashed service connection.
    }
    isBound = false
    serviceMessenger = null
  }

  private fun totalRamBytes(): Long {
    val manager = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
      ?: return 0L
    return ActivityManager.MemoryInfo().also(manager::getMemoryInfo).totalMem
  }

  private fun emit(event: String, payload: String) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, payload)
  }

  @Suppress("OVERRIDE_DEPRECATION")
  override fun onCatalystInstanceDestroy() {
    serviceMessenger?.let { sendCommand(it, GemmaServiceProtocol.COMMAND_UNLOAD) }
    unbindServiceSafely()
    inferenceReady = false
    synchronized(this) {
      pendingLoad = null
      pendingUnload = null
      currentPromise = null
    }
  }

  private data class LoadRequest(val modelPath: String, val promise: Promise)

  private companion object {
    const val ENGINE_STOPPED_MESSAGE =
      "Движок Gemma безопасно остановлен: процессор устройства несовместим с его native runtime. Приложение продолжает работать; выберите GGUF-модель в локальном каталоге."
  }
}
