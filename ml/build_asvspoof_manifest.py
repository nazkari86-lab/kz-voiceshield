"""Build a reproducible ASVspoof DF manifest after the archives are extracted.

The manifest contains metadata only; it never copies audio into the repository.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def parse_key_line(line: str, audio_root: Path) -> dict[str, object] | None:
    fields = line.strip().split()
    if len(fields) < 6 or fields[0].startswith("#"):
        return None
    # DF-keys-full format:
    # speaker file_id codec corpus attack_id label trim progress generator ...
    speaker, file_id, codec, corpus = fields[:4]
    label = fields[5]
    attack = fields[8] if len(fields) > 8 else "unknown"
    if label not in {"bonafide", "spoof"}:
        return None
    return {
        "schemaVersion": "voiceshield.voice-auth.v1",
        "id": file_id,
        "path": str(audio_root / f"{file_id}.flac"),
        "label": "human" if label == "bonafide" else "synthetic",
        "split": "test",
        "language": "unknown",
        "speakerId": speaker,
        "generatorId": attack if label == "spoof" else "human",
        "codec": codec,
        "corpus": corpus,
        "consent": True,
        "source": "ASVspoof2021_DF",
    }


def build_manifest(key_file: Path, audio_root: Path) -> list[dict[str, object]]:
    rows = []
    for line in key_file.read_text(encoding="utf-8", errors="replace").splitlines():
        row = parse_key_line(line, audio_root)
        if row:
            rows.append(row)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--key-file", type=Path, required=True)
    parser.add_argument("--audio-root", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    rows = build_manifest(args.key_file, args.audio_root)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")
    print(json.dumps({"out": str(args.out), "rows": len(rows), "audioRoot": str(args.audio_root)}))


if __name__ == "__main__":
    main()
