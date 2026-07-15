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

### Recent Kazakhstan operation taxonomy (verified July 2026)

The rule layer now includes operation-specific patterns grounded in current
official Kazakhstan alerts. These are taxonomy and response-playbook sources,
not labelled call recordings: the app still requires multiple transcript signals
and should be validated on consented, reviewer-labelled calls.

- **Fake National Bank + loan rescue:** claim that an online loan was opened in
  the victim's name, followed by pressure to take a new loan or transfer to a
  safe account. [National Bank alert](https://nationalbank.kz/ru/news/informacionnye-soobshcheniya/19505).
- **Fake Kazakhtelecom + malicious file:** contract-expiry or discount pretext,
  followed by a file/link/APK that can enable device or banking access.
  [Police alert](https://www.gov.kz/memleket/entities/qriim/press/news/details/1149158).
- **Dropper recruitment:** offers to rent a card or provide online-banking
  access, with payment per transaction and Telegram/crypto cash-out patterns.
  [AFM alert](https://www.gov.kz/memleket/entities/afm/press/news/details/1256798).
- **Spoofed local caller infrastructure:** international routing, virtual phone
  stations and local-looking mobile numbers. [KNB alert](https://www.gov.kz/memleket/entities/knb/press/news/details/1210123).

The operation metadata is shipped in
`mobile/src/data/kazakhstanFraudOperations.ts` and exposed in the model
manifest so reviewers can see why each local pattern exists.

1. **Consented in-app donation** — opt-in "donate this call (redacted transcript
   + label)". App already redacts + encrypts + tracks provenance. Best source.
2. **Scam-baiting / public recordings** (YouTube, Telegram) → our Whisper → label.
   Keep transcripts/features, not redistributed audio (copyright/consent).
3. **Regulator / bank / press scheme catalogs** (KZ police 102, banks; RU press) →
   taxonomy + synthetic seeds, not raw data.
4. **Synthetic** (`ml/synthesize.py`) — RU/KZ scripts per scheme, TTS a subset for
   ASR robustness. Minority of data, always `provenance.trusted=false`, **never in test**.
5. **Native-speaker labeling** of donated + baited transcripts.

### Downloaded transfer sources (2026-07-15)

The local adapter now supports and the Downloads staging area contains four
open transfer sources plus FraudLens:

- `DmitryKRX/anti_spam_ru`: 66,119 Russian spam/non-spam rows, Apache-2.0.
- `alt-gnome/telegram-spam`: 21,411 Russian text rows, CC0-1.0; weak for call
  fraud because its domain/labels are not phone-call annotations.
- `FredZhang7/all-scam-spam`: 42,619 multilingual email scam/spam rows,
  Apache-2.0; useful only for broad lexical transfer.
- `Bektemir96az96/Uzbek_and_Russian_Phishing_dataset`: 100,000 balanced RU/UZ
  phishing/legitimate rows, Apache-2.0; not KZ and not phone audio.
- `Abdurohman/fraudlens-ru-v1`: 6,327 Russian fraud messages with fraud type,
  target, method, platform and severity, CC BY 4.0; the closest transfer set to
  VoiceShield, but positive-only and sourced from public Telegram channels.

The five sources are adapted into `voiceshield.dataset.v2` with
`provenance.trusted=false`. They may improve pretraining or exploratory
feature extraction, but their metrics must never be reported as RU/KZ product
quality. The downloaded files and SHA-256 manifest are kept outside Git at
`~/Downloads/kz-voiceshield-external-datasets/`.

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

### KSC2 universal language pack

KSC2 is integrated as a model-agnostic post-ASR layer instead of an adapter tied
to one Whisper checkpoint. The app preserves the raw transcript as evidence and
stores the normalized transcript, language segmentation, lexicon coverage,
corrections, pack version, and source separately. Rules and any selected local or
cloud LLM consume the normalized transcript plus a bounded provenance context.

Build the compact pack directly from the split archive without extracting audio:

```bash
/usr/bin/python3 ml/prepare_ksc2_language_pack.py \
  /path/to/KSC2/ISSAI_KSC2.tar.gz.part* \
  --output ml/artifacts/ksc2-language-pack-v1 \
  --mobile-output mobile/src/data/ksc2LanguagePack.generated.json
```

The command streams the complete gzip/tar sequence, so reaching the end also
validates the gzip CRC. It rejects missing/non-contiguous parts, caps transcript
member size, never extracts FLAC audio, and emits a deterministic transcript
digest, bounded lexicon/phrase lists, a reservoir benchmark, metadata, and the
required CC BY 4.0 attribution. The mobile JSON intentionally excludes raw
benchmark transcripts and audio.

The language pack improves Kazakh/Russian transcription quality for every ASR
backend. It does **not** provide fraud labels and must not be evaluated as the
fraud classifier's ground truth. The later ONNX correction model should be
trained on hypotheses produced by every supported ASR against KSC2 references;
its held-out report must be split by upstream speaker/source boundary.

### Kazakh Quality Pack (5 GiB ceiling)

The mobile app uses one shared, model-agnostic Kazakh contract: normalized KSC2
text, language/code-switch segments, lightweight suffix decomposition, and a
versioned semantic IR containing numbers, money, organizations, negation, and
commands. Local GGUF, Gemma, and configured cloud providers receive the same
bounded context. Generated answers are checked for language loss, malformed
mixed-script tokens, and newly introduced numbers before being presented as
high-confidence output.

The catalog offers a checksum-pinned Qolda GGUF download from the public
`issai/Qolda_GGUF` repository. Q5_K_M (2,889,513,536 bytes) is preferred when
RAM/storage allow it; Q4_K_M (2,497,280,576 bytes) is the fallback. Qolda is an
Apache-2.0 Kazakh/Russian/English assistant and semantic reviewer. On an 8 GiB
phone it runs against completed transcript chunks rather than concurrently with
the heavy ASR runtime, avoiding Android low-memory process termination.

The complete planned package remains below 5 GiB: Qolda Q5, FastConformer
KZ/RU INT8, compact KSC2 data, and a future quantized Til-2B-GEC correction
model. Til-2B-GEC is currently marked `external_build`, not downloadable: its
official source is gated and has no publisher-provided mobile GGUF artifact.
It must be license-accepted, converted, benchmarked, and checksum-pinned before
the UI may expose it as available.

### Morphology and syntax sources

The runtime now has a compact formal Kazakh suffix analyser for plural,
possessive, case, participle/future, and polite or negative imperative forms.
It produces a bounded semantic IR with a lemma guess, UPOS guess, grammatical
features, and morpheme segmentation. This is the on-device layer used to
preserve commands such as `айтпаңыз`, `жібермеңіз`, and `аударыңыз`; it is not
presented as a replacement for a finite-state parser.

For offline evaluation and future model training, build a provenance-tracked
linguistic pack from local copies of the primary sources:

```bash
python3 ml/prepare_kazakh_linguistic_pack.py \
  --ud /path/UD_Kazakh-KTB/kk_ktb-ud-train.conllu \
  --ud /path/UD_Kazakh-KTB/kk_ktb-ud-test.conllu \
  --kazdet /path/kdt-NLANU-0.01.connlu.txt \
  --apertium-lexc /path/apertium-kaz.kaz.lexc \
  --output ml/artifacts/kazakh-linguistic-pack-v1
```

The artifact contains no sentence text. It records source hashes, licenses,
lemma/POS/morphology/dependency aggregates, and Apertium tag/rule inventories.
Do not place it in the APK automatically: Apertium is GPL-3.0-or-later while
UD-KTB and KazDET are CC BY-SA. Any distributed derivative must preserve the
required licensing, attribution, and share-alike obligations. Qazcorpus and the
Almaty corpus are intentionally not scraped; they require separate terms/API
permission review before they become sources in this pipeline.

To reproduce the Android FastConformer artifact from NVIDIA's local `.nemo`
checkpoint, use `ml/export_fastconformer_kk_ru.py`. The resulting INT8 ONNX
file is distributed as a checksum-pinned GitHub Release asset, not committed
to Git.

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
