package kz.voiceshield

class WhisperContext(modelPath: String, language: String, beamSize: Int = 1, threads: Int = 4) : AutoCloseable {
  private var handle: Long = nativeInit(modelPath, language, beamSize, threads)

  init {
    require(handle != 0L) { "Whisper model could not be loaded" }
  }

  fun process(chunk: ShortArray) = nativeProcessChunkInt16(handle, chunk)
  fun transcribe(): String = nativeTranscribe(handle)
  /** Transcribe arbitrary PCM-16 @ 16 kHz mono without touching the streaming buffer. */
  fun transcribePcm(pcm: ShortArray): String = nativeTranscribePcm(handle, pcm)
  fun reset() = nativeResetBuffer(handle)
  fun bufferSize(): Int = nativeBufferSize(handle)

  override fun close() {
    if (handle != 0L) nativeFree(handle)
    handle = 0L
  }

  private external fun nativeInit(modelPath: String, language: String, beamSize: Int, threads: Int): Long
  private external fun nativeProcessChunkInt16(handle: Long, chunk: ShortArray)
  private external fun nativeProcessChunkFloat32(handle: Long, chunk: FloatArray)
  private external fun nativeTranscribe(handle: Long): String
  private external fun nativeTranscribePcm(handle: Long, pcm: ShortArray): String
  private external fun nativeGetLastTranscript(handle: Long): String
  private external fun nativeResetBuffer(handle: Long)
  private external fun nativeBufferSize(handle: Long): Int
  private external fun nativeFree(handle: Long)

  companion object {
    init { System.loadLibrary("whisper-jni") }
  }
}
