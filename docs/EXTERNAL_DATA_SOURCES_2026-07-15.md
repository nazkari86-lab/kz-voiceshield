# External data sources

Downloaded on 2026-07-15 for local VoiceShield experiments. Raw files are kept outside Git because they are third-party datasets and can change upstream. The checksums below identify the exact files used in this run.

## Fraud text transfer data

| Source | License | Role | Local file | SHA-256 |
| --- | --- | --- | --- |
| [DiFraud SMS](https://huggingface.co/datasets/difraud/difraud) | MIT | English phishing/sms transfer data | `difraud_sms_train.jsonl` | `5b8ae34ab91ff7389758e7205e305a231f03d944e3496e1fe5cc9f3f855f0957` |
| [DiFraud Job Scams](https://huggingface.co/datasets/difraud/difraud) | MIT | English job-scam transfer data | `difraud_job_scams_train.jsonl` | downloaded locally |
| [Trilingual fraud consumer protection](https://huggingface.co/datasets/karanverma19/trilingual_fraud_consumer_protection_v2) | MIT | Small multilingual transfer/evaluation set | `trilingual_fraud_consumer_protection_v2.csv` | `1cc2ccb829756eb541760dc5f5dc7375894b04b1e8fd872d01616ea698a99ed9` |

These sources are marked `provenance.trusted=false` by the adapter. They must not be reported as a real RU/KZ held-out evaluation set. The current project still needs reviewer-labelled Russian and Kazakh calls for production calibration.

## Deepfake / anti-spoof data

| Source | License | Role | Local file | SHA-256 |
| --- | --- | --- | --- | --- |
| [ASVspoof 2021 DF](https://huggingface.co/datasets/SpeechAntiSpoofingBenchmarks/ASVspoof2021_DF) | ODbL dataset packaging | bona-fide/deepfake labels and audio benchmark | `asvspoof2021_df_labels.parquet` | `7476fca63ea30e910a153909537ce17df9f951542e12d606965887344f70eb9e` |

The labels file has `611,829` rows. The audio shards are hundreds of MB each and the complete benchmark is multi-GB; audio is intentionally downloaded in controlled shards for evaluation, not silently embedded into the APK.

For a small real anti-spoof checkpoint, [LCNN ASVspoof 2019](https://huggingface.co/caa-speech-detection-asvspoof2019/lcnn) is also downloaded locally as `lcnn_best.pt` (MIT, 3.4 MB). It expects 16 kHz mono audio converted to LFCC features (60 coefficients, 512 FFT, 160 hop, about 4 seconds). It is a practical candidate for conversion to ONNX/Android, but it is not yet connected to the APK until the LFCC/maxout architecture is reproduced and validated against the checkpoint.

## Kazakh and Russian speech

| Source | License/status | Role | Local file |
| --- | --- | --- | --- |
| [Kazakh Speech Dataset](https://huggingface.co/datasets/Flamme-VRM/kazakh-speech-dataset) | CC BY 4.0 | Kazakh ASR transcript/quality evaluation | `kazakh_speech_train.csv` |
| [Russian call-center speech](https://huggingface.co/datasets/MaratDV/russian-call-center-speech-ru) | upstream terms must be reviewed | Russian telephone-domain ASR sample | `sample_ru.ogg` only |

Speech corpora improve ASR and language coverage. They do not provide fraud labels by themselves.

## Reproduction

```bash
python3 ml/adapters.py --source difraud_sms --in /path/difraud_sms_train.jsonl --out ml/artifacts/difraud_sms.jsonl
python3 ml/adapters.py --source difraud_job_scams --in /path/difraud_job_scams_train.jsonl --out ml/artifacts/difraud_job_scams.jsonl
python3 ml/adapters.py --source trilingual_fraud --in /path/trilingual_fraud_consumer_protection_v2.csv --out ml/artifacts/trilingual_fraud.jsonl
python3 ml/train_baseline.py ml/artifacts/difraud_sms.jsonl ml/artifacts/difraud_job_scams.jsonl ml/artifacts/trilingual_fraud.jsonl --allow-untrusted --output ml/artifacts/external-transfer
```

The resulting model is a transfer baseline only. It must remain shadow-scored beside rules until a reviewer-labelled RU/KZ test set exists.

## Safe registry and quality checks

The raw files are registered without copying them into the APK. Generate a local
inventory with file sizes and SHA-256 hashes:

```bash
python3 ml/dataset_registry.py \
  --root data/external/2026-07-15 \
  --out ml/artifacts/dataset_registry.json
```

The registry marks every external entry as `trusted=false` and
`liveDecisionUse=false`. This is deliberate: ASVspoof labels are suitable for
offline deepfake evaluation, while the Kazakh speech CSV is suitable for ASR
quality/WER evaluation. Neither is a fraud ground-truth set.

Inspect the downloaded LCNN checkpoint before attempting conversion:

```bash
python3 ml/inspect_antispoof_checkpoint.py \
  data/external/2026-07-15/deepfake/lcnn_best.pt \
  --out ml/artifacts/lcnn_checkpoint_report.json
```

The inspector reports tensor shapes but never declares Android compatibility.
The LFCC frontend, architecture, ONNX numerical parity, and anti-spoof EER
must be validated offline before any separate Audio Lab module is considered.
