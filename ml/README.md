# VoiceShield ML Baseline

This pipeline trains a comparison model; it does not replace the deterministic rules. It accepts only `voiceshield.dataset.v2` JSONL cases whose provenance is reviewer-trusted, removes duplicate transcripts, requires all three labels, and exports explicit rules-vs-ML disagreements.

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

Training is blocked below 30 unique trusted cases or below five examples in any label. Those limits only prevent meaningless smoke runs; production release requires a substantially larger independent RU/KZ dataset, documented labeling instructions, held-out evaluation, calibration, and bias/error review.

Generated artifacts are intentionally git-ignored. Treat imported cases as untrusted until a reviewer confirms the label in VoiceShield.
