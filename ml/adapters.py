"""Adapt external fraud datasets into the VoiceShield v2 JSONL schema.

External corpora are transfer/pretraining material only: every row is written
with provenance {"trusted": false} so it can never enter the trusted evaluation
set (see ml/dataset.py). Column names below are the *expected* mapping for each
source — verify them against the actual download, as upstream formats change.

Sources this targets (see docs/DATA_AND_ML_ROADMAP.md):
  - teleantifraud : TeleAntiFraud-28k  (github.com/JimmyMa99/TeleAntiFraud)
  - korccvi       : Korean voice-phishing transcripts (github.com/kimdesok/...)
  - sms_scam      : SMS Scam Detection merged (Kaggle vinit119)

Usage:
    python ml/adapters.py --source korccvi --in raw.jsonl --out ml/artifacts/korccvi.jsonl \
        --text-field text --label-field label
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

csv.field_size_limit(2**31 - 1)

SCHEMA_VERSION = "voiceshield.dataset.v2"

# source -> (default text column, default label column, default language, fraud-value matcher)
PRESETS: dict[str, dict] = {
    "teleantifraud": {"text": "transcript", "label": "label", "lang": "zh", "fraud_values": {"fraud", "1", "scam", "true"}},
    "korccvi": {"text": "text", "label": "label", "lang": "ko", "fraud_values": {"1", "fraud", "vishing", "true"}},
    "sms_scam": {"text": "text", "label": "label", "lang": "mul", "fraud_values": {"spam", "scam", "1", "smishing"}},
    "anti_spam_ru": {"text": "text", "label": "is_spam", "lang": "ru", "fraud_values": {"1", "spam", "scam", "true"}},
    "telegram_spam": {"text": "text", "label": "label", "lang": "ru", "fraud_values": {"1", "spam", "scam", "true"}},
    "all_scam_spam": {"text": "text", "label": "is_spam", "lang": "mul", "fraud_values": {"1", "spam", "scam", "true"}},
    "uzbek_russian_phishing": {"text": "text", "label": "label", "lang": "ru-uz", "fraud_values": {"1", "phishing", "fraud", "scam", "true"}},
    "fraudlens_ru": {"text": "text_clean", "label": "fraud_type", "lang": "ru", "fraud_values": {"phone_scam", "bank_scam", "social_engineering", "phishing", "recruitment_scam", "investment_scam", "online_scam"}},
}


def _label_for(raw_label: str, fraud_values: set[str]) -> str:
    return "true_positive" if str(raw_label).strip().lower() in fraud_values else "false_positive"


def _read_rows(path: Path):
    if path.suffix.lower() == ".csv":
        with path.open(encoding="utf-8", newline="") as handle:
            yield from csv.DictReader(handle)
    elif path.suffix.lower() == ".parquet":
        try:
            import pyarrow.parquet as parquet
        except ImportError as error:
            raise RuntimeError("Parquet input requires pyarrow; install it or convert the file to CSV") from error
        table = parquet.read_table(path)
        yield from table.to_pylist()
    else:  # jsonl
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                yield json.loads(line)


def _flatten_dialogue(payload: dict) -> str:
    """TeleAntiFraud-style dialogue: {"dialogue_history": [{"role","content"}]}."""
    turns = payload.get("dialogue_history") or payload.get("dialogue") or []
    return " ".join(str(turn.get("content", "")).strip() for turn in turns if turn.get("content"))


def adapt_dialogues(source: str, in_path: Path, default_label: str) -> list[dict]:
    """Adapt TeleAntiFraud-style dialogue JSON (a file or a directory of them)."""
    files = sorted(in_path.rglob("*.json")) if in_path.is_dir() else [in_path]
    label = "true_positive" if default_label == "fraud" else "false_positive"
    rows: list[dict] = []
    for index, file in enumerate(files, start=1):
        try:
            payload = json.loads(file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        transcript = _flatten_dialogue(payload)
        if len(transcript.split()) < 3:
            continue
        rows.append({
            "schemaVersion": SCHEMA_VERSION,
            "id": f"{source}-{index:06d}",
            "transcript": transcript,
            "label": label,
            "score": 0,
            "lang": payload.get("lang", "zh"),
            "scheme": "external",
            "provenance": {"origin": source, "trusted": False},
        })
    return rows


def adapt(source: str, in_path: Path, text_field: str | None, label_field: str | None) -> list[dict]:
    preset = PRESETS.get(source, {"text": "text", "label": "label", "lang": "mul", "fraud_values": {"1", "fraud", "scam", "spam"}})
    tf = text_field or preset["text"]
    lf = label_field or preset["label"]
    rows: list[dict] = []
    for index, record in enumerate(_read_rows(in_path), start=1):
        transcript = str(record.get(tf, "")).strip()
        if len(transcript.split()) < 3:
            continue
        metadata = {
            key: record[key] for key in ("target", "method", "platform", "severity", "date", "channel")
            if record.get(key) not in (None, "")
        }
        rows.append({
            "schemaVersion": SCHEMA_VERSION,
            "id": f"{source}-{index:06d}",
            "transcript": transcript,
            "label": _label_for(record.get(lf, ""), preset["fraud_values"]),
            "score": 0,
            "lang": record.get("lang", preset["lang"]),
            "scheme": str(record.get("fraud_type") or "external"),
            "externalMetadata": metadata,
            "provenance": {"origin": source, "trusted": False},
        })
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Adapt an external fraud dataset to VoiceShield v2 JSONL")
    parser.add_argument("--source", required=True, choices=sorted(PRESETS) + ["generic"])
    parser.add_argument("--in", dest="in_path", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--text-field")
    parser.add_argument("--label-field")
    parser.add_argument("--format", choices=["rows", "dialogue"], default="rows",
                        help="'dialogue' = TeleAntiFraud-style {dialogue_history:[...]} JSON file or directory")
    parser.add_argument("--default-label", choices=["fraud", "safe"], default="fraud",
                        help="Label for dialogue files that carry no explicit label")
    args = parser.parse_args()

    if not args.in_path.exists():
        raise SystemExit(f"Input not found: {args.in_path}. Download the source first (see docs/DATA_AND_ML_ROADMAP.md).")

    if args.format == "dialogue":
        rows = adapt_dialogues(args.source, args.in_path, args.default_label)
    else:
        rows = adapt(args.source, args.in_path, args.text_field, args.label_field)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in rows), encoding="utf-8")
    print(json.dumps({"source": args.source, "rows": len(rows), "out": str(args.out)}))


if __name__ == "__main__":
    main()
