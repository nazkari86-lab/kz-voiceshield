"""Create a traceable Kazakh morphology and syntax pack from local open sources.

The input corpora remain outside this repository. The output contains bounded
aggregate annotations and source attribution, never sentence text.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


SCHEMA = "voiceshield.kazakh-linguistic-pack.v1"
SOURCE_INFO = {
    "apertium-kaz": {
        "license": "GPL-3.0-or-later",
        "url": "https://github.com/apertium/apertium-kaz",
        "use": "morphology tags and rule inventory",
    },
    "ud-kazakh-ktb": {
        "license": "CC BY-SA 4.0",
        "url": "https://github.com/UniversalDependencies/UD_Kazakh-KTB",
        "use": "lemma, UPOS, features and dependency aggregates",
    },
    "kazdet": {
        "license": "CC BY-SA",
        "url": "https://github.com/nlacslab/kazdet",
        "use": "lemma, UPOS, features and dependency aggregates",
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def parse_conllu(paths: Iterable[Path]) -> tuple[Counter[str], Counter[str], Counter[str], Counter[str], int]:
    lemmas: Counter[str] = Counter()
    upos: Counter[str] = Counter()
    features: Counter[str] = Counter()
    relations: Counter[str] = Counter()
    token_count = 0
    for path in paths:
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line or line.startswith("#"):
                continue
            fields = line.split("\t")
            if len(fields) != 10 or "-" in fields[0] or "." in fields[0]:
                continue
            _, form, lemma, tag, _, feats, _, relation, _, _ = fields
            if not form or not lemma or lemma == "_":
                continue
            token_count += 1
            lemmas[lemma.lower()] += 1
            if tag != "_":
                upos[tag] += 1
            if relation != "_":
                relations[relation] += 1
            if feats != "_":
                for feature in feats.split("|"):
                    features[feature] += 1
    return lemmas, upos, features, relations, token_count


def parse_apertium_tags(path: Path) -> tuple[Counter[str], Counter[str]]:
    tags: Counter[str] = Counter()
    lexicons: Counter[str] = Counter()
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith("LEXICON "):
            lexicon = stripped.split(maxsplit=1)[1].split()[0]
            lexicons[lexicon] += 1
        start = 0
        while True:
            start = stripped.find("%<", start)
            if start < 0:
                break
            end = stripped.find("%>", start + 2)
            if end < 0:
                break
            tags[stripped[start + 2:end]] += 1
            start = end + 2
    return tags, lexicons


def bounded(counter: Counter[str], limit: int) -> list[dict[str, object]]:
    return [{"value": value, "count": count} for value, count in counter.most_common(limit)]


def build_pack(
    output: Path,
    ud_paths: list[Path],
    kazdet_path: Path | None,
    apertium_lexc: Path | None,
    limit: int,
) -> dict[str, object]:
    all_conllu = [*ud_paths, *([kazdet_path] if kazdet_path else [])]
    if not all_conllu and apertium_lexc is None:
        raise ValueError("Provide at least one CoNLL-U source or an Apertium lexc source")
    for path in [*all_conllu, *([apertium_lexc] if apertium_lexc else [])]:
        if not path.is_file():
            raise FileNotFoundError(path)

    lemmas, upos, features, relations, token_count = parse_conllu(all_conllu)
    apertium_tags, apertium_lexicons = parse_apertium_tags(apertium_lexc) if apertium_lexc else (Counter(), Counter())
    sources: list[dict[str, str]] = []
    for source_id, paths in [
        ("ud-kazakh-ktb", ud_paths),
        ("kazdet", [kazdet_path] if kazdet_path else []),
        ("apertium-kaz", [apertium_lexc] if apertium_lexc else []),
    ]:
        if paths:
            sources.append({"id": source_id, **SOURCE_INFO[source_id], "sha256": ",".join(sha256(path) for path in paths)})

    payload: dict[str, object] = {
        "schemaVersion": SCHEMA,
        "packVersion": "1.0.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "licenseNotice": "Derived pack: preserve source attribution and comply with every listed source license before distribution.",
        "sources": sources,
        "statistics": {"tokens": token_count, "uniqueLemmas": len(lemmas), "upos": len(upos), "features": len(features), "relations": len(relations)},
        "commonLemmas": bounded(lemmas, limit),
        "upos": bounded(upos, 64),
        "morphologicalFeatures": bounded(features, limit),
        "dependencyRelations": bounded(relations, 64),
        "apertiumTags": bounded(apertium_tags, limit),
        "apertiumLexicons": bounded(apertium_lexicons, limit),
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "linguistic-pack.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "LICENSE-ATTRIBUTION.txt").write_text(
        "This directory contains derived aggregate metadata. Before distribution, comply with:\n"
        + "\n".join(f"- {source['id']}: {source['license']} ({source['url']})" for source in sources)
        + "\n",
        encoding="utf-8",
    )
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ud", action="append", type=Path, default=[], help="UD Kazakh KTB .conllu file; may be repeated")
    parser.add_argument("--kazdet", type=Path, help="Extracted KazDET .conllu/.txt file")
    parser.add_argument("--apertium-lexc", type=Path, help="apertium-kaz.kaz.lexc")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=5000)
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be positive")
    build_pack(args.output, args.ud, args.kazdet, args.apertium_lexc, args.limit)


if __name__ == "__main__":
    main()
