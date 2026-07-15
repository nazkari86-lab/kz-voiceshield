package kz.voiceshield

import android.app.Service
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Message
import android.os.Messenger
import android.os.Process
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import java.io.File
import java.util.concurrent.CancellationException
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicBoolean

/** Runs MediaPipe in a disposable process so a native crash cannot close the UI. */
class GemmaInferenceService : Service() {
  private val worker = Executors.newSingleThreadExecutor()
  private val generationSettled = AtomicBoolean(true)
  private val fullBuilder = StringBuilder()
  private var inference: LlmInference? = null
  @Volatile private var generationFuture: Future<String>? = null

  private val incomingMessenger = Messenger(Handler(Looper.getMainLooper()) { message ->
    val reply = message.replyTo ?: return@Handler true
    when (message.what) {
      GemmaServiceProtocol.COMMAND_LOAD -> {
        val modelPath = message.data.getString(GemmaServiceProtocol.KEY_MODEL_PATH).orEmpty()
        val maxTokens = message.data.getInt(GemmaServiceProtocol.KEY_MAX_TOKENS)
        worker.execute { loadModel(modelPath, maxTokens, reply) }
      }
      GemmaServiceProtocol.COMMAND_GENERATE -> {
        val prompt = message.data.getString(GemmaServiceProtocol.KEY_PROMPT).orEmpty()
        worker.execute { generate(prompt, reply) }
      }
      GemmaServiceProtocol.COMMAND_CANCEL -> cancelGeneration()
      GemmaServiceProtocol.COMMAND_UNLOAD -> worker.execute { unload(reply) }
    }
    true
  })

  override fun onBind(intent: Intent): IBinder = incomingMessenger.binder

  private fun loadModel(modelPath: String, maxTokens: Int, reply: Messenger) {
    try {
      val modelFile = File(modelPath)
      if (!modelFile.isFile) {
        sendError(reply, GemmaServiceProtocol.COMMAND_LOAD, "MODEL_NOT_FOUND", "Model file not found")
        return
      }
      cancelGeneration()
      inference?.close()
      inference = null

      val options = LlmInference.LlmInferenceOptions.builder()
        .setModelPath(modelPath)
        .setMaxTokens(maxTokens.takeIf { it == GemmaRuntimePolicy.CONTEXT_TOKENS }
          ?: GemmaRuntimePolicy.CONTEXT_TOKENS)
        .setMaxTopK(GemmaRuntimePolicy.MAX_TOP_K)
        .setPreferredBackend(LlmInference.Backend.CPU)
        .build()
      inference = LlmInference.createFromOptions(applicationContext, options)
      send(reply, GemmaServiceProtocol.RESPONSE_LOAD_OK)
    } catch (error: Throwable) {
      inference = null
      sendError(
        reply,
        GemmaServiceProtocol.COMMAND_LOAD,
        "LLM_LOAD_ERROR",
        error.message ?: "Failed to load Gemma",
      )
    }
  }

  private fun generate(prompt: String, reply: Messenger) {
    val llm = inference
    if (llm == null) {
      sendError(reply, GemmaServiceProtocol.COMMAND_GENERATE, "LLM_NOT_READY", "Gemma is not loaded")
      return
    }
    cancelGeneration()
    generationSettled.set(false)
    synchronized(fullBuilder) { fullBuilder.clear() }
    try {
      val future = llm.generateResponseAsync(prompt) { partialResult, done ->
        if (!partialResult.isNullOrEmpty()) {
          synchronized(fullBuilder) { fullBuilder.append(partialResult) }
          send(reply, GemmaServiceProtocol.RESPONSE_TOKEN, Bundle().apply {
            putString(GemmaServiceProtocol.KEY_TEXT, partialResult)
          })
        }
        if (done) completeGeneration(reply, fullResponse())
      }
      generationFuture = future
      future.addListener({
        try {
          val response = future.get()
          completeGeneration(reply, fullResponse().ifEmpty { response })
        } catch (_: CancellationException) {
          // Cancellation is initiated by the UI process.
        } catch (error: ExecutionException) {
          failGeneration(reply, error.cause ?: error)
        } catch (error: Throwable) {
          failGeneration(reply, error)
        }
      }, DIRECT_EXECUTOR)
    } catch (error: Throwable) {
      failGeneration(reply, error)
    }
  }

  private fun completeGeneration(reply: Messenger, response: String) {
    if (!generationSettled.compareAndSet(false, true)) return
    generationFuture = null
    send(reply, GemmaServiceProtocol.RESPONSE_DONE, Bundle().apply {
      putString(GemmaServiceProtocol.KEY_TEXT, response)
    })
  }

  private fun failGeneration(reply: Messenger, error: Throwable) {
    if (!generationSettled.compareAndSet(false, true)) return
    generationFuture = null
    sendError(
      reply,
      GemmaServiceProtocol.COMMAND_GENERATE,
      "LLM_GENERATE_ERROR",
      error.message ?: "Generation failed",
    )
  }

  private fun cancelGeneration() {
    generationSettled.set(true)
    generationFuture?.cancel(true)
    generationFuture = null
    synchronized(fullBuilder) { fullBuilder.clear() }
  }

  private fun unload(reply: Messenger) {
    try {
      cancelGeneration()
      inference?.close()
      inference = null
      send(reply, GemmaServiceProtocol.RESPONSE_UNLOAD_OK)
    } catch (error: Throwable) {
      sendError(
        reply,
        GemmaServiceProtocol.COMMAND_UNLOAD,
        "LLM_UNLOAD_ERROR",
        error.message ?: "Failed to unload Gemma",
      )
    }
  }

  private fun fullResponse(): String = synchronized(fullBuilder) { fullBuilder.toString() }

  private fun send(reply: Messenger, what: Int, data: Bundle = Bundle()) {
    try {
      Message.obtain(null, what).also { message ->
        message.data = data
        reply.send(message)
      }
    } catch (_: Throwable) {
      // The UI process has gone away; the bound service will be destroyed.
    }
  }

  private fun sendError(reply: Messenger, request: Int, code: String, message: String) {
    send(reply, GemmaServiceProtocol.RESPONSE_ERROR, Bundle().apply {
      putInt(GemmaServiceProtocol.KEY_REQUEST, request)
      putString(GemmaServiceProtocol.KEY_ERROR_CODE, code)
      putString(GemmaServiceProtocol.KEY_ERROR_MESSAGE, message)
    })
  }

  override fun onDestroy() {
    cancelGeneration()
    try {
      inference?.close()
    } catch (_: Throwable) {
      // This process is disposable; teardown must not affect the UI process.
    }
    inference = null
    worker.shutdownNow()
    super.onDestroy()
    Process.killProcess(Process.myPid())
  }

  private companion object {
    val DIRECT_EXECUTOR = Executor { command -> command.run() }
  }
}
