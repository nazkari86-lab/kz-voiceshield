#include <jni.h>
#include <string>
#include <vector>
#include <mutex>

#if VS_HAS_WHISPER_CPP
#include "whisper.h"
#endif

struct VsWhisperHandle {
#if VS_HAS_WHISPER_CPP
  whisper_context *ctx = nullptr;
#endif
  std::string language = "ru";
  int beamSize = 1;
  int threads = 4;
  std::string lastTranscript;
  std::vector<int16_t> pcmBuffer;
  std::mutex bufferMutex;
  std::mutex inferenceMutex;
};

namespace {
constexpr size_t kMaxBufferedSamples = 16000 * 30;

void trimBuffer(std::vector<int16_t> &buffer) {
  if (buffer.size() <= kMaxBufferedSamples) return;
  buffer.erase(buffer.begin(), buffer.end() - static_cast<std::ptrdiff_t>(kMaxBufferedSamples));
}
}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_kz_voiceshield_WhisperContext_nativeInit(JNIEnv *env, jobject, jstring modelPath, jstring language, jint beamSize, jint threads) {
  auto *handle = new VsWhisperHandle();
  const char *languageChars = env->GetStringUTFChars(language, nullptr);
  handle->language = languageChars == nullptr ? "ru" : languageChars;
  if (languageChars != nullptr) {
    env->ReleaseStringUTFChars(language, languageChars);
  }
  handle->beamSize = static_cast<int>(beamSize);
  handle->threads = static_cast<int>(threads);
#if VS_HAS_WHISPER_CPP
  const char *modelPathChars = env->GetStringUTFChars(modelPath, nullptr);
  whisper_context_params cparams = whisper_context_default_params();
  cparams.use_gpu = false;
  handle->ctx = modelPathChars == nullptr ? nullptr : whisper_init_from_file_with_params(modelPathChars, cparams);
  if (modelPathChars != nullptr) {
    env->ReleaseStringUTFChars(modelPath, modelPathChars);
  }
  if (handle->ctx == nullptr) {
    delete handle;
    return 0;
  }
#else
  delete handle;
  return 0;
#endif
  return reinterpret_cast<jlong>(handle);
}

extern "C" JNIEXPORT void JNICALL
Java_kz_voiceshield_WhisperContext_nativeProcessChunkInt16(JNIEnv *env, jobject, jlong ptr, jshortArray chunk) {
  auto *handle = reinterpret_cast<VsWhisperHandle *>(ptr);
  if (handle == nullptr) return;
  std::lock_guard<std::mutex> lock(handle->bufferMutex);
  const jsize len = env->GetArrayLength(chunk);
  const size_t offset = handle->pcmBuffer.size();
  handle->pcmBuffer.resize(offset + static_cast<size_t>(len));
  env->GetShortArrayRegion(chunk, 0, len, reinterpret_cast<jshort *>(handle->pcmBuffer.data() + offset));
  trimBuffer(handle->pcmBuffer);
}

extern "C" JNIEXPORT void JNICALL
Java_kz_voiceshield_WhisperContext_nativeProcessChunkFloat32(JNIEnv *env, jobject, jlong ptr, jfloatArray chunk) {
  auto *handle = reinterpret_cast<VsWhisperHandle *>(ptr);
  if (handle == nullptr) return;
  std::lock_guard<std::mutex> lock(handle->bufferMutex);
  const jsize len = env->GetArrayLength(chunk);
  std::vector<float> samples(static_cast<size_t>(len));
  env->GetFloatArrayRegion(chunk, 0, len, samples.data());
  const size_t offset = handle->pcmBuffer.size();
  handle->pcmBuffer.resize(offset + static_cast<size_t>(len));
  for (jsize i = 0; i < len; ++i) {
    const float clamped = samples[static_cast<size_t>(i)] < -1.0f
                              ? -1.0f
                              : samples[static_cast<size_t>(i)] > 1.0f ? 1.0f : samples[static_cast<size_t>(i)];
    handle->pcmBuffer[offset + static_cast<size_t>(i)] = static_cast<int16_t>(clamped * 32767.0f);
  }
  trimBuffer(handle->pcmBuffer);
}

extern "C" JNIEXPORT jstring JNICALL
Java_kz_voiceshield_WhisperContext_nativeTranscribe(JNIEnv *env, jobject, jlong ptr) {
  auto *handle = reinterpret_cast<VsWhisperHandle *>(ptr);
  if (handle == nullptr) return env->NewStringUTF("");
  std::vector<int16_t> pcmBuffer;
  {
    // Release the capture buffer before inference so recording continues while
    // Whisper processes the previous window.
    std::lock_guard<std::mutex> lock(handle->bufferMutex);
    pcmBuffer.swap(handle->pcmBuffer);
  }
  std::string transcript;
#if VS_HAS_WHISPER_CPP
  if (handle->ctx != nullptr && !pcmBuffer.empty()) {
    std::lock_guard<std::mutex> inferenceLock(handle->inferenceMutex);
    std::vector<float> pcmf32;
    pcmf32.reserve(pcmBuffer.size());
    for (const int16_t sample : pcmBuffer) {
      pcmf32.push_back(static_cast<float>(sample) / 32768.0f);
    }
    whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_BEAM_SEARCH);
    params.print_progress = false;
    params.print_realtime = false;
    params.print_timestamps = false;
    params.translate = false;
    params.language = handle->language.c_str();
    params.n_threads = handle->threads;
    params.beam_search.beam_size = handle->beamSize;

    if (whisper_full(handle->ctx, params, pcmf32.data(), static_cast<int>(pcmf32.size())) == 0) {
      std::string text;
      const int segments = whisper_full_n_segments(handle->ctx);
      for (int i = 0; i < segments; ++i) {
        text += whisper_full_get_segment_text(handle->ctx, i);
      }
      transcript = text;
    }
  }
#endif
  handle->lastTranscript = transcript;
  return env->NewStringUTF(transcript.c_str());
}

extern "C" JNIEXPORT jstring JNICALL
Java_kz_voiceshield_WhisperContext_nativeTranscribePcm(JNIEnv *env, jobject, jlong ptr, jshortArray pcm) {
  auto *handle = reinterpret_cast<VsWhisperHandle *>(ptr);
  if (handle == nullptr) return env->NewStringUTF("");
  const jsize len = env->GetArrayLength(pcm);
  std::vector<int16_t> samples(static_cast<size_t>(len));
  env->GetShortArrayRegion(pcm, 0, len, reinterpret_cast<jshort *>(samples.data()));
  std::string transcript;
#if VS_HAS_WHISPER_CPP
  if (handle->ctx != nullptr && !samples.empty()) {
    // whisper_context is not safe for concurrent whisper_full calls. Live
    // capture can keep buffering while this lock serializes inference only.
    std::lock_guard<std::mutex> inferenceLock(handle->inferenceMutex);
    std::vector<float> pcmf32;
    pcmf32.reserve(samples.size());
    for (const int16_t s : samples) {
      pcmf32.push_back(static_cast<float>(s) / 32768.0f);
    }
    whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_BEAM_SEARCH);
    params.print_progress = false;
    params.print_realtime = false;
    params.print_timestamps = false;
    params.translate = false;
    params.language = handle->language.c_str();
    params.n_threads = handle->threads;
    params.beam_search.beam_size = handle->beamSize;
    if (whisper_full(handle->ctx, params, pcmf32.data(), static_cast<int>(pcmf32.size())) == 0) {
      const int segments = whisper_full_n_segments(handle->ctx);
      for (int i = 0; i < segments; ++i) transcript += whisper_full_get_segment_text(handle->ctx, i);
    }
  }
#endif
  handle->lastTranscript = transcript;
  return env->NewStringUTF(transcript.c_str());
}

extern "C" JNIEXPORT jstring JNICALL
Java_kz_voiceshield_WhisperContext_nativeGetLastTranscript(JNIEnv *env, jobject, jlong ptr) {
  auto *handle = reinterpret_cast<VsWhisperHandle *>(ptr);
  return env->NewStringUTF(handle == nullptr ? "" : handle->lastTranscript.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_kz_voiceshield_WhisperContext_nativeResetBuffer(JNIEnv *, jobject, jlong ptr) {
  auto *handle = reinterpret_cast<VsWhisperHandle *>(ptr);
  if (handle != nullptr) {
    std::lock_guard<std::mutex> lock(handle->bufferMutex);
    handle->pcmBuffer.clear();
  }
}

extern "C" JNIEXPORT jint JNICALL
Java_kz_voiceshield_WhisperContext_nativeBufferSize(JNIEnv *, jobject, jlong ptr) {
  auto *handle = reinterpret_cast<VsWhisperHandle *>(ptr);
  if (handle == nullptr) return 0;
  std::lock_guard<std::mutex> lock(handle->bufferMutex);
  return static_cast<jint>(handle->pcmBuffer.size());
}

extern "C" JNIEXPORT void JNICALL
Java_kz_voiceshield_WhisperContext_nativeFree(JNIEnv *, jobject, jlong ptr) {
  auto *handle = reinterpret_cast<VsWhisperHandle *>(ptr);
  if (handle == nullptr) return;
#if VS_HAS_WHISPER_CPP
  if (handle->ctx != nullptr) {
    whisper_free(handle->ctx);
    handle->ctx = nullptr;
  }
#endif
  delete handle;
}
