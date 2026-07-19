# VoiceShield RU/KZ grammar baseline

`voiceshield_engine.py` is a small, explainable rule baseline for SMS and
dataset labeling. It reads `seeds/voiceshield_seed_kz.json` directly, supports
RU/KZ stem-prefix matching, multi-word patterns, vendor context, and a
conservative `needs_review` outcome.

This layer is deliberately separate from Live Shield. It does not read audio,
does not alter ASR, and must not make an automatic call-blocking decision. The
seed is an internal prototype and is not a production-quality or holdout
dataset.

Run the checks from the repository root:

```bash
python3 -m unittest discover -s ml/tests -v
python3 ml/voiceshield_engine.py --self-test
python3 ml/voiceshield_engine.py "Kaspi: срочно переведите деньги на безопасный счет"
```

The mobile SMS layer uses a compact derived TypeScript artifact at
`mobile/src/data/voiceShieldKzSeed.ts`. If the seed changes, update that
artifact and rerun both mobile and Python tests.
