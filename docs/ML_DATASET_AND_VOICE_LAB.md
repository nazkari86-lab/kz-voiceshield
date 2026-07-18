# RU/KZ dataset and voice-auth lab

This is an offline research layer. It never changes the protected Live Shield
audio lifecycle and never promotes a candidate model into live decisions.

## Kazakhstan scheme catalog

`ml/kz_fraud_scenarios.py` contains source-backed scenario specifications. Each
generated JSONL row keeps the official `sourceUrl`, `sourceDate`, channel,
scheme, tactics and requested actions. Generated rows are always
`provenance.trusted=false`.

Generate a bootstrap corpus:

```bash
python3 ml/kz_fraud_scenarios.py \
  --per-scenario 8 --safe 80 \
  --out ml/artifacts/kz_fraud_bootstrap.jsonl
```

This is not a real-call evaluation set. It must be used for transfer/training
and regression fixtures only. Add reviewer-labelled real cases separately and
keep them speaker/source-disjoint from train/dev/test.

## Human review gate

Every real case needs consent, redaction, source metadata and two independent
review labels. Disagreements go to `needs_review`; they must not be silently
converted to fraud or safe. The holdout must report false positives per 100
safe calls, critical precision, scheme recall, calibration and RU/KZ/mixed
breakdowns.

## Voice authenticity lab

`ml/voice_auth_lab.py` validates a manifest and evaluates detector score files.
It does not record audio or create a personal assistant voice. Synthetic audio
must be created by an explicitly approved TTS/voice-conversion tool, while
human audio must be consented and stored outside git.

Manifest rules:

- speakers cannot cross train/dev/test;
- synthetic generators must be recorded;
- RU, KZ and mixed speech are separate strata;
- telephone codecs, speakerphone, Bluetooth and re-recording are required;
- consent is mandatory;
- raw audio is not committed to the repository.

The first detector candidates are AASIST, LCNN and RawNet-style models. They
remain offline candidates until checksum, license, conversion, low-FPR
calibration, cross-generator validation and Xiaomi telephony tests pass.

The product should expose separate signals:

```text
fraud score | voice authenticity | transcript quality | final confidence
```

Voice authenticity is never sufficient by itself to end a call or label a
person a fraudster.
