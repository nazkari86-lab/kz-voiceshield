export type QualityLabAsset = {
  id: string
  title: string
  role: string
  status: 'ready' | 'candidate' | 'blocked'
  source: string
  detail: string
}

// This is intentionally a capability ledger, not proof that an external model
// is installed or that it is suitable for live calls.
export const qualityLabManifest: QualityLabAsset[] = [
  { id: 'common-voice-kk', title: 'Mozilla Common Voice Kazakh', role: 'Offline ASR WER/CER evaluation', status: 'candidate', source: 'CC0-1.0', detail: 'Not bundled. Import only into the local quality lab after recording provenance.' },
  { id: 'common-voice-ru', title: 'Mozilla Common Voice Russian', role: 'Offline ASR WER/CER evaluation', status: 'candidate', source: 'CC0-1.0', detail: 'Not bundled. Use a reproducible subset rather than silently downloading a multi-GB corpus.' },
  { id: 'fraud-regression', title: 'Fraud regression suite', role: 'Rule-scoring regression checks', status: 'ready', source: 'Repository fixture', detail: 'Synthetic/public cases only. It prevents regressions but cannot prove real-world accuracy.' },
  { id: 'cyrillic-ocr', title: 'RU/KZ Cyrillic OCR', role: 'Offline OCR for assistant images and scam screenshots', status: 'ready', source: 'Tesseract4Android · rus/kaz traineddata', detail: 'Runs a local Cyrillic fallback after ML Kit. OCR output is evidence to review, not proof of authenticity.' },
  { id: 'silero-vad', title: 'Silero VAD ONNX', role: 'Offline speech-presence and audio-quality evidence', status: 'ready', source: 'sherpa-onnx release · bundled asset', detail: 'Sherpa-compatible model bundled and loaded through the existing JNI runtime. It is isolated from Live Shield until Xiaomi benchmark.' },
  { id: 'aasist', title: 'AASIST ONNX', role: 'Offline synthetic-voice evidence', status: 'ready', source: 'MIT · bundled asset', detail: 'Bundled ASVspoof2019 LA checkpoint. It is uncalibrated for RU/KZ telephony and never changes live risk.' },
  { id: 'asvspoof', title: 'ASVspoof 2021 DF', role: 'Offline deepfake benchmark', status: 'candidate', source: 'ODC-By evaluation data', detail: 'Useful for evaluation. It is not evidence of RU/KZ phone-call deepfake accuracy.' },
  { id: 'sherpa', title: 'sherpa-onnx', role: 'Isolated Android ASR experiment', status: 'blocked', source: 'Apache-2.0 runtime', detail: 'Requires a compatible RU/KZ model, APK-size review and physical-device benchmark before adoption.' },
]

export const qualityLabPolicy = {
  liveShieldMutation: false,
  autoDownload: false,
  promotionRule: 'Checksum + licence + offline evaluation + physical Xiaomi benchmark + explicit review',
}
