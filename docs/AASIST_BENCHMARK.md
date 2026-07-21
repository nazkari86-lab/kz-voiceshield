# AASIST and ASVspoof Benchmark

This workflow uses the downloaded ASVspoof2021 DF archives to measure the
bundled AASIST checkpoint offline. It does not change the Android Live Shield
audio path and it does not put the raw dataset into GitHub or the APK.

## Data policy

- Keep ASVspoof archives under `data/external/` and out of Git history.
- Keep only manifests, scores, and aggregate reports in reviewable output
  folders. A manifest contains file paths and dataset metadata, not audio.
- Treat AASIST scores as an uncalibrated evidence signal until an evaluation
  report covers both human and synthetic classes and a low-FPR operating point.
- Do not use the benchmark threshold to auto-end a real call. AASIST is
  `liveDecisionUse=false` until RU/KZ telephone audio and physical Xiaomi
  validation are completed.

## Build a manifest

The downloaded key bundle contains the required metadata at
`keys/DF/CM/trial_metadata.txt`. Extract that member directly; the bundle also
contains auxiliary baseline score files, so a full archive extraction is not
needed:

```bash
mkdir -p /tmp/voiceshield-asvspoof-keys
tar -xOzf data/external/2026-07-19/deepfake/asvspoof2021_df/DF-keys-full.tar.gz \
  keys/DF/CM/trial_metadata.txt \
  > /tmp/voiceshield-asvspoof-keys/trial_metadata.txt

python -m ml.build_asvspoof_manifest \
  --key-file /tmp/voiceshield-asvspoof-keys/trial_metadata.txt \
  --audio-root /path/to/extracted/ASVspoof2021_DF_eval/flac \
  --out data/benchmarks/asvspoof2021_df.jsonl
```

The current bundle is sufficient for this member, but its trailing auxiliary
archive content reports a gzip truncation during a full extraction. Check the
target member and dataset archive parts separately; do not treat a successful
file-size check as proof that every archive member is intact.

The parser follows the DF key layout and records `label`, `codec`,
`generatorId`, `speakerId`, and the original file ID. It maps `bonafide` to
`human` and `spoof` to `synthetic`.

## Run a smoke benchmark

Use a small limit first to validate paths and the ONNX runtime:

```bash
python -m ml.aasist_benchmark \
  --manifest data/benchmarks/asvspoof2021_df.jsonl \
  --max-items 100 \
  --scores data/benchmarks/asvspoof2021_df.scores.jsonl \
  --out data/benchmarks/asvspoof2021_df.report.json
```

The report contains ROC-AUC, EER, operating points at 1%, 3%, and 5% false
positive rate, and valid codec/generator slices. The score JSONL preserves
one auditable row per successfully scored file; unreadable files are listed in
`errorsDetail` without stopping the whole run.

## Promotion gates

Before any mobile integration, require:

1. Both classes and all intended codecs are present in the report.
2. The chosen threshold is selected on a calibration split, not on the final
   test set.
3. False-positive rate is measured on real RU/KZ human phone audio.
4. Results are repeated with noisy, compressed, short, and overlapping speech.
5. The Android artifact is benchmarked on the target Xiaomi models for CPU,
   memory, latency, and thermal behavior.

Until those gates pass, show the signal as `synthetic voice evidence` beside
the rule/ML disagreement and never as a standalone fraud verdict.
