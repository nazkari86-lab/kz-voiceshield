# VoiceShield — Data & ML Roadmap

How to move the detector beyond hand-written rules, where to get data, and what
the app tells users about it. The live detector stays rule-based (transparent,
not trained on user calls); ML is added as a disclosed, experimental comparison
layer only after an independent RU/KZ evaluation passes.

## Two separate data needs (do not conflate)

1. **Transcript-level fraud labels** → for the scoring / ML classifier.
2. **Call audio** → for the RU/KZ ASR layer (Whisper) and deepfake detection.

## Existing datasets (verified July 2026)

| Dataset | What | Use | Link |
|---|---|---|---|
| TeleAntiFraud-28k | 28.5k audio-text telecom-fraud pairs, 3 tasks, privacy-preserving build | Transfer/pretrain + **replicable build pipeline** | github.com/JimmyMa99/TeleAntiFraud · arXiv:2503.24115 |
| KorCCVi | ~2.9k voice-phishing transcripts (695 fraud) | Cross-lingual transfer, schema, hard negatives | github.com/kimdesok/Text-classification-of-voice-phishing-transcipts |
| Korean VP (IEEE DataPort) | transcripts + back-translation + SMOTE | Augmentation technique for scarce data | ieee-dataport.org |
| SMS Scam merged | 138k msgs, 41 langs incl. Russian | SMS/smishing text signal | kaggle.com/datasets/vinit119/sms-scam-detection-dataset-merged |
| ASVspoof 5 / 2024 | synthetic/deepfake voice detection | AI-voice-clone (family scam) — later | sciencedirect.com/…/S0885230825000506 |
| **KSC2** | 1.2k h, 600k utt, **KZ-RU code-switching** | **Whisper fine-tune for RU/KZ ASR** | issai.nu.edu.kz/kz-speech-corpus · HF issai/Kazakh_Speech_Corpus_2 · OpenSLR 102 |

Method refs: arXiv 2502.03964 (real-time LLM phone-scam detection), 2409.11643,
2606.24523 (Turkish scam audio). **None are RU/KZ scam-labelled** — existing data
is for transfer/bootstrap/ASR, not ground truth. Check each licence before use.

## Own RU/KZ dataset (the moat) — sources by legality × quality

1. **Consented in-app donation** — opt-in "donate this call (redacted transcript
   + label)". App already redacts + encrypts + tracks provenance. Best source.
2. **Scam-baiting / public recordings** (YouTube, Telegram) → our Whisper → label.
   Keep transcripts/features, not redistributed audio (copyright/consent).
3. **Regulator / bank / press scheme catalogs** (KZ police 102, banks; RU press) →
   taxonomy + synthetic seeds, not raw data.
4. **Synthetic** (`ml/synthesize.py`) — RU/KZ scripts per scheme, TTS a subset for
   ASR robustness. Minority of data, always `provenance.trusted=false`, **never in test**.
5. **Native-speaker labeling** of donated + baited transcripts.

Balance note: to hit "≤1 critical false positive / 100 safe calls," collect **as
many benign calls as scam** (bank/clinic/delivery/school). Safe data is easier to
get consented and is the hardest part of precision.

## ML progression (tie to data maturity)

- **St.0 (now):** rules + `ml/train_baseline.py` (multilingual MiniLM + logistic) on
  trusted JSONL. Rules stay the fast layer.
- **St.1:** multilingual embeddings (LaBSE / multilingual-e5) baseline on real+synthetic;
  measure rules-vs-ML disagreement (Review view has the slot).
- **St.2:** fine-tune XLM-R → export TFLite/ONNX on-device, once ≥2–3k real labels.
- **St.3:** fine-tune Whisper on KSC2 (KZ-RU code-switch); measure WER on real audio.
- **St.4:** on-device small LLM for explanations; ASVspoof-transfer deepfake detector.

## Validation

Held-out RU/KZ test = **real only**; split **by call**, not utterance (untrusted rows
already excluded from splits). Targets: critical precision ≥95%, ≤1 critical FP/100
safe, rules <2s / ML <8s, crash-free >99.8%. Report calibration, per-scheme recall,
per-language (ru/kz/mixed), noise/speakerphone robustness.

## Pipeline (this repo)

```bash
python ml/synthesize.py --per-scheme 14 --safe 80 --out ml/artifacts/synthetic.jsonl
python ml/adapters.py --source korccvi --in raw.jsonl --out ml/artifacts/korccvi.jsonl
python ml/model_card.py ml/artifacts/*.jsonl --model-version 0.1.1-baseline \
    --out ml/artifacts/model_card.json --ts-out mobile/src/data/trainingDataSnapshot.ts
python ml/train_baseline.py trusted.jsonl --output ml/artifacts/baseline   # needs real trusted data
```

`ml/model_card.py` feeds the app's **Data & Model** screen, so users see exactly
what any model was trained on. Artifacts are git-ignored; the committed snapshot
in `mobile/src/data/` is what ships.

## Status (2026-07-11)

- Transfer corpus assembled from **real** data: KorCCVi (2,927), TeleAntiFraud
  sample dialogues (2,342), synthetic RU/KZ (176) = 5,445 rows, all `trusted:false`.
- **Baseline trained** (`train_baseline.py --allow-untrusted --vectorizer tfidf`):
  TF-IDF char n-grams + logistic regression, held-out accuracy ≈0.98 / macro-F1
  ≈0.97 **on the transfer split — NOT validated on real RU/KZ**. Metrics are shown
  in the app's Data & Model screen with that caveat. Not used for live decisions.
- Full TeleAntiFraud-28k on HuggingFace is **gated per-account** — request access
  on the dataset page; the adapter already handles its parquet/dialogue formats.
- Next: real RU/KZ labelled data (donation + baiting) → retrain + real held-out
  eval → only then consider ML for live scoring.

## Transparency in the app

The **Model** tab shows: the active detector (rule engine, N rules, not ML, not
trained on user calls), the experimental ML status, the training-data composition
(counts by source/label/language), the source list, and the honest caveats above.
