# VoiceShield ML Baseline

This pipeline trains a comparison model; it does not replace the deterministic rules. It accepts only `voiceshield.dataset.v2` JSONL cases whose provenance is reviewer-trusted, removes duplicate transcripts, requires all three labels, and exports explicit rules-vs-ML disagreements.

## Reproducible model evaluation

Use the offline evaluator for a larger holdout instead of asserting exact
answers in unit tests:

```bash
python ml/evaluate_models.py \
  ml/artifacts/trilingual_fraud.jsonl \
  ml/artifacts/difraud_sms.jsonl \
  ml/artifacts/difraud_job_scams.jsonl \
  --allow-untrusted \
  --out ml/artifacts/evaluation-latest.json
```

`--allow-untrusted` is required for transfer corpora and never means that the
result is production evidence. The report includes macro-F1, balanced
accuracy, per-label precision/recall/F1, and rules-vs-model disagreements.
To compare an LLM, provide a JSONL file with one record per holdout case:
`{"id":"case-id","label":"true_positive"}`. Predictions are paired by
case ID; missing or duplicate predictions are rejected.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r ml/requirements.txt
python ml/train_baseline.py dataset.jsonl --output ml/artifacts/baseline
```

The adapter also supports the downloaded open transfer sources:

```bash
python ml/adapters.py --source anti_spam_ru --in /path/df.csv --out anti_spam_ru.jsonl
python ml/adapters.py --source telegram_spam --in /path/train.parquet --out telegram_spam.jsonl
python ml/adapters.py --source all_scam_spam --in /path/junkmail_dataset.csv --out all_scam_spam.jsonl
python ml/adapters.py --source uzbek_russian_phishing --in /path/phishing_legitimate_dataset.csv --out phishing.jsonl
python ml/adapters.py --source fraudlens_ru --in /path/fraudlens_v2_combined.jsonl --out fraudlens_ru.jsonl
```

All external rows are emitted with `provenance.trusted=false`. They are
transfer/pretraining material only and cannot enter the trusted RU/KZ held-out
evaluation set. Telegram spam is especially weak for phone fraud because its
labels/domain are not a call-level fraud annotation.

## Quality lab (does not touch Live Shield)

The quality lab consumes **local prediction JSONL** and produces reproducible
WER/CER reports. It does not download data, call a cloud model, ship raw audio,
or change the detector. Start with the checked-in smoke fixture:

```bash
python ml/quality_lab.py asr ml/fixtures/asr_quality_smoke.jsonl \
  --model-id fastconformer-kk-ru \
  --out ml/artifacts/asr-quality-smoke.json
```

For a real evaluation, create a JSONL with `id`, `language` (`kk`, `ru`, or
`mixed`), `reference`, and `hypothesis`. The external registry documents
Mozilla Common Voice RU/KZ and ASVspoof as offline evaluation sources. Download
them only after confirming their current licence and available disk space; they
remain transfer/evaluation data and never become evidence of live-call quality.

`ml/model_registry.py` is a candidate ledger for Silero VAD, ASVspoof LCNN and
sherpa-onnx. Candidates have no automatic downloader and cannot enter Live
Shield. Promotion requires an exact checksum, licence check, offline report and
physical Xiaomi benchmark.

For physical-device timings, capture only metadata rows (`device`, `modelId`,
`audioMs`, `wallMs`, `peakRssMb`) and summarise them without uploading audio:

```bash
python ml/device_benchmark.py my-xiaomi-runs.jsonl \
  --out ml/artifacts/xiaomi-benchmark.json
```

The report includes p50/p95 latency, real-time factor and memory. A model is a
candidate for further review only when p95 real-time factor is at most `1.0`.

Training is blocked below 30 unique trusted cases or below five examples in any label. Those limits only prevent meaningless smoke runs; production release requires a substantially larger independent RU/KZ dataset, documented labeling instructions, held-out evaluation, calibration, and bias/error review.

Generated artifacts are intentionally git-ignored. Treat imported cases as untrusted until a reviewer confirms the label in VoiceShield.
