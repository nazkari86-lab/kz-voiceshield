#!/usr/bin/env python3
"""
QLoRA fine-tune google/gemma-3-1b-it (or qwen2.5-1.5b-instruct)
on VoiceShield labeled call transcripts.

Requirements:
  pip install unsloth trl peft datasets transformers bitsandbytes

Usage:
  python finetune_gemma.py \
    --train ft_data/train.jsonl \
    --val ft_data/val.jsonl \
    --output ./gemma-voiceshield-lora \
    --model google/gemma-3-1b-it

After training, export to GGUF for on-device MediaPipe:
  (Not directly supported — use llama.cpp convert_hf_to_gguf.py then quantize)
"""

import argparse
import json
from pathlib import Path

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", required=True)
    parser.add_argument("--val", required=True)
    parser.add_argument("--output", default="./gemma-voiceshield-lora")
    parser.add_argument("--model", default="google/gemma-3-1b-it")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--lora-r", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--max-seq-len", type=int, default=2048)
    args = parser.parse_args()

    try:
        from unsloth import FastLanguageModel
        from trl import SFTTrainer
        from transformers import TrainingArguments
        from datasets import Dataset
    except ImportError:
        print("ERROR: Install requirements first:")
        print("  pip install unsloth trl peft datasets transformers bitsandbytes")
        return

    def load_jsonl(path: str) -> list[dict]:
        with open(path) as f:
            return [json.loads(line) for line in f if line.strip()]

    train_data = load_jsonl(args.train)
    val_data = load_jsonl(args.val)
    print(f"Train: {len(train_data)}, Val: {len(val_data)}")

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.model,
        max_seq_length=args.max_seq_len,
        load_in_4bit=True,
        dtype=None,  # auto
    )

    model = FastLanguageModel.get_peft_model(
        model,
        r=args.lora_r,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        lora_alpha=args.lora_alpha,
        lora_dropout=0.05,
        bias="none",
        use_gradient_checkpointing="unsloth",
    )

    def format_example(ex: dict) -> dict:
        return {"text": ex["text"]}

    train_ds = Dataset.from_list([format_example(e) for e in train_data])
    val_ds = Dataset.from_list([format_example(e) for e in val_data])

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        dataset_text_field="text",
        max_seq_length=args.max_seq_len,
        args=TrainingArguments(
            output_dir=args.output,
            num_train_epochs=args.epochs,
            per_device_train_batch_size=args.batch_size,
            gradient_accumulation_steps=4,
            warmup_ratio=0.03,
            learning_rate=args.lr,
            lr_scheduler_type="cosine",
            logging_steps=10,
            eval_strategy="epoch",
            save_strategy="epoch",
            fp16=True,
            report_to="none",
        ),
    )

    print(f"Fine-tuning {args.model} with QLoRA r={args.lora_r}...")
    trainer.train()
    model.save_pretrained(args.output)
    tokenizer.save_pretrained(args.output)
    print(f"Saved LoRA adapter to {args.output}")
    print("\nTo export to GGUF for on-device use:")
    print("  git clone https://github.com/ggerganov/llama.cpp")
    print(f"  python llama.cpp/convert_hf_to_gguf.py {args.output} --outtype q4_k_m --outfile voiceshield.gguf")

if __name__ == "__main__":
    main()
