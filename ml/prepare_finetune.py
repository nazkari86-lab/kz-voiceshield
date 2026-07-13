#!/usr/bin/env python3
"""
Prepare fine-tuning dataset from VoiceShield labeled transcripts.

Input:  voiceshield_finetune_export.jsonl  (exported from app via Share)
Output: train.jsonl, val.jsonl  (80/20 split, deduplicated, balanced)

Then fine-tune with:
  pip install unsloth transformers datasets peft trl
  python prepare_finetune.py --input export.jsonl --output ./ft_data
  python finetune_gemma.py --data ./ft_data  (see below)

Target model: google/gemma-3-1b-it  (or qwen2.5-1.5b-instruct for smaller)
Method: QLoRA 4-bit (saves ~70% VRAM vs full fine-tune)
"""

import argparse
import json
import random
import hashlib
from pathlib import Path
from collections import Counter

def dedup(examples: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for ex in examples:
        h = hashlib.md5(ex["text"][:200].encode()).hexdigest()
        if h not in seen:
            seen.add(h)
            out.append(ex)
    return out

def balance(examples: list[dict], max_ratio: float = 3.0) -> list[dict]:
    by_label: dict[str, list] = {}
    for ex in examples:
        label = ex.get("label", "uncertain")
        by_label.setdefault(label, []).append(ex)
    counts = Counter({k: len(v) for k, v in by_label.items()})
    min_count = min(counts.values())
    max_allowed = int(min_count * max_ratio)
    balanced = []
    for label, items in by_label.items():
        random.shuffle(items)
        balanced.extend(items[:max_allowed])
    random.shuffle(balanced)
    return balanced

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="JSONL file exported from VoiceShield")
    parser.add_argument("--output", default="./ft_data", help="Output directory")
    parser.add_argument("--val-ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    raw = []
    with open(args.input) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    raw.append(json.loads(line))
                except json.JSONDecodeError:
                    continue

    print(f"Loaded {len(raw)} raw examples")
    raw = dedup(raw)
    print(f"After dedup: {len(raw)}")
    balanced = balance(raw)
    print(f"After balancing: {len(balanced)}")

    label_counts = Counter(ex.get("label", "?") for ex in balanced)
    lang_counts = Counter(ex.get("lang", "?") for ex in balanced)
    print(f"Label distribution: {dict(label_counts)}")
    print(f"Language distribution: {dict(lang_counts)}")

    split = int(len(balanced) * (1 - args.val_ratio))
    train, val = balanced[:split], balanced[split:]

    for name, data in [("train", train), ("val", val)]:
        path = out_dir / f"{name}.jsonl"
        with open(path, "w") as f:
            for ex in data:
                f.write(json.dumps(ex, ensure_ascii=False) + "\n")
        print(f"Wrote {len(data)} examples to {path}")

    print("\nNext step — fine-tune (requires GPU or Google Colab):")
    print("  pip install unsloth trl peft")
    print(f"  python finetune_gemma.py --train {out_dir}/train.jsonl --val {out_dir}/val.jsonl")

if __name__ == "__main__":
    main()
