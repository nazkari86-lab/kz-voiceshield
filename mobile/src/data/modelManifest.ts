import { threatRules } from '@scoring'
import { trainingDataSnapshot } from './trainingDataSnapshot'

// What the app truthfully shows on the "Data & Model" screen. The LIVE detector
// is the deterministic rule engine — it is not machine-learned and is not
// trained on the user's calls. The ML baseline is experimental, disclosed here,
// and not used for live decisions. Composition numbers come from ml/model_card.py
// (regenerate the snapshot; never hand-edit its numbers).

export const APP_VERSION = '0.9.5'

export type SourceRef = { name: string; role: string; link?: string }

export const modelManifest = {
  activeDetector: {
    name: `Rule engine v${APP_VERSION}`,
    ruleCount: threatRules.length,
    machineLearned: false,
    note:
      'Live protection uses a deterministic rule engine curated from KZ/RU fraud patterns. ' +
      'It does not learn from — and is never trained on — your calls. Everything runs on-device.',
  },
  ml: {
    status: 'experimental — not used for live decisions',
    version: trainingDataSnapshot.modelVersion,
    embeddingModel: 'TF-IDF char n-grams (multilingual, on-device friendly)',
    classifier: 'logistic-regression',
    trainedOn: trainingDataSnapshot,
    sources: [
      { name: 'Synthetic RU/KZ scripts', role: 'Generated from the scheme taxonomy — not real calls' },
      { name: 'TeleAntiFraud-28k', role: 'Transfer only', link: 'github.com/JimmyMa99/TeleAntiFraud' },
      { name: 'KorCCVi (Korean voice-phishing)', role: 'Transfer only', link: 'github.com/kimdesok/Text-classification-of-voice-phishing-transcipts' },
      { name: 'SMS Scam merged (Kaggle)', role: 'SMS/smishing signal (transfer)', link: 'kaggle.com/datasets/vinit119/sms-scam-detection-dataset-merged' },
      { name: 'KSC2 (Kazakh Speech Corpus 2)', role: 'ASR fine-tuning (RU/KZ speech)', link: 'issai.nu.edu.kz/kz-speech-corpus' },
    ] as SourceRef[],
    caveats: [
      'Synthetic and external data are transfer/pretraining only and are excluded from any held-out test.',
      'A real, reviewer-labelled RU/KZ evaluation must pass before ML is used for live decisions.',
      'Donated (opt-in) real cases are redacted and encrypted before they can ever become training data.',
    ],
  },
  privacy:
    'No transcripts or audio leave the device unless you explicitly donate a case. ' +
    'Donated data is redacted (codes/PIN/CVV and long numbers removed) and encrypted first.',
}
