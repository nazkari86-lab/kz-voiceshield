package kz.voiceshield

internal object GemmaServiceProtocol {
  const val COMMAND_LOAD = 1
  const val COMMAND_GENERATE = 2
  const val COMMAND_CANCEL = 3
  const val COMMAND_UNLOAD = 4

  const val RESPONSE_LOAD_OK = 101
  const val RESPONSE_TOKEN = 102
  const val RESPONSE_DONE = 103
  const val RESPONSE_ERROR = 104
  const val RESPONSE_UNLOAD_OK = 105

  const val KEY_MODEL_PATH = "modelPath"
  const val KEY_MAX_TOKENS = "maxTokens"
  const val KEY_PROMPT = "prompt"
  const val KEY_TEXT = "text"
  const val KEY_REQUEST = "request"
  const val KEY_ERROR_CODE = "errorCode"
  const val KEY_ERROR_MESSAGE = "errorMessage"
}
