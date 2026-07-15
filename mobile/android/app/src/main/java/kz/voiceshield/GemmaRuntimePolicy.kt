package kz.voiceshield

internal object GemmaRuntimePolicy {
  const val CONTEXT_TOKENS = 2048
  const val MAX_TOP_K = 64
  const val MIN_TOTAL_RAM_BYTES = 3L * 1024L * 1024L * 1024L

  fun unsupportedReason(totalRamBytes: Long): String? {
    if (totalRamBytes <= 0L || totalRamBytes >= MIN_TOTAL_RAM_BYTES) return null
    val totalRamGb = totalRamBytes.toDouble() / (1024.0 * 1024.0 * 1024.0)
    return "Для Gemma нужно минимум 3 ГБ RAM; устройство сообщает %.1f ГБ. Откройте каталог и выберите меньшую GGUF-модель.".format(totalRamGb)
  }
}
