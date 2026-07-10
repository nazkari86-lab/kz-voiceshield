# VoiceShield ML Baseline

This pipeline trains a comparison model; it does not replace the deterministic rules. It accepts only `voiceshield.dataset.v2` JSONL cases whose provenance is reviewer-trusted, removes duplicate transcripts, requires all three labels, and exports explicit rules-vs-ML disagreements.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r ml/requirements.txt
python ml/train_baseline.py dataset.jsonl --output ml/artifacts/baseline
```

Training is blocked below 30 unique trusted cases or below five examples in any label. Those limits only prevent meaningless smoke runs; production release requires a substantially larger independent RU/KZ dataset, documented labeling instructions, held-out evaluation, calibration, and bias/error review.

Generated artifacts are intentionally git-ignored. Treat imported cases as untrusted until a reviewer confirms the label in VoiceShield.
