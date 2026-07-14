#!/usr/bin/env python3
"""Export NVIDIA kk/ru FastConformer CTC branch to a sherpa-onnx package."""

from __future__ import annotations

import argparse
from pathlib import Path

import nemo.collections.asr as nemo_asr
import onnx
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic


def write_metadata(model_path: Path, vocab_size: int, normalize_type: str) -> None:
    model = onnx.load(model_path)
    del model.metadata_props[:]
    metadata = {
        "vocab_size": str(vocab_size),
        "normalize_type": "" if normalize_type == "NA" else str(normalize_type),
        "subsampling_factor": "8",
        "model_type": "EncDecHybridRNNTCTCBPEModel",
        "version": "1",
        "model_author": "NVIDIA NeMo",
        "url": "https://huggingface.co/nvidia/stt_kk_ru_fastconformer_hybrid_large",
        "comment": "CTC branch exported for KZ VoiceShield offline Android ASR",
    }
    for key, value in metadata.items():
        item = model.metadata_props.add()
        item.key = key
        item.value = value
    onnx.save(model, model_path)


@torch.no_grad()
def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    checkpoint = args.checkpoint.resolve()
    output_dir = args.output_dir.resolve()
    if not checkpoint.is_file():
        raise FileNotFoundError(checkpoint)
    output_dir.mkdir(parents=True, exist_ok=True)

    asr_model = nemo_asr.models.ASRModel.restore_from(str(checkpoint), map_location="cpu")
    asr_model.change_decoding_strategy(decoder_type="ctc")
    asr_model.set_export_config({"decoder_type": "ctc"})
    asr_model.eval()

    tokens_path = output_dir / "tokens.txt"
    with tokens_path.open("w", encoding="utf-8") as tokens:
        for index, token in enumerate(asr_model.joint.vocabulary):
            tokens.write(f"{token} {index}\n")
        tokens.write(f"<blk> {index + 1}\n")

    fp32_path = output_dir / "model.onnx"
    int8_path = output_dir / "model.int8.onnx"
    asr_model.export(str(fp32_path))
    write_metadata(fp32_path, asr_model.decoder.vocab_size, asr_model.cfg.preprocessor.normalize)
    quantize_dynamic(str(fp32_path), str(int8_path), weight_type=QuantType.QUInt8)
    print(f"Exported: {fp32_path}")
    print(f"Quantized: {int8_path}")
    print(f"Tokens: {tokens_path}")


if __name__ == "__main__":
    main()
