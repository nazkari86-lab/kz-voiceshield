"""Inspect an anti-spoof checkpoint before any ONNX/Android conversion.

The script is deliberately non-invasive: it reports keys and tensor shapes,
and refuses to claim compatibility. Architecture reproduction and accuracy
validation must happen offline before a runtime module is considered.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def inspect(path: Path) -> dict:
    try:
        import torch
    except ImportError as error:
        raise RuntimeError("Checkpoint inspection requires torch; do not install it in the Android project") from error
    payload = torch.load(path, map_location="cpu", weights_only=False)
    state = payload.get("state_dict", payload) if isinstance(payload, dict) else payload
    if not isinstance(state, dict):
        return {"format": type(payload).__name__, "compatible": False, "reason": "no state_dict mapping"}
    tensors = {str(key): list(value.shape) for key, value in state.items() if hasattr(value, "shape")}
    return {
        "format": "pytorch_state_dict",
        "tensorCount": len(tensors),
        "sampleTensors": dict(list(tensors.items())[:25]),
        "expectedInput": "16 kHz mono LFCC: 60 coefficients, 512 FFT, 160 hop, approximately 4 seconds",
        "compatible": False,
        "reason": "architecture and LFCC/maxout reproduction still require offline validation",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect an anti-spoof checkpoint safely")
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    report = inspect(args.checkpoint)
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        args.out.write_text(rendered, encoding="utf-8")
    print(rendered, end="")


if __name__ == "__main__":
    main()
