#!/usr/bin/env python3
"""Explainable RU/KZ SMS fraud grammar engine.

This is a small, dependency-free baseline for dataset labeling and regression
tests. It is not a replacement for a trained model and must not make an
automatic call-blocking decision by itself.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from dataclasses import asdict, dataclass, field, replace
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable

try:
    from .subword_tokenizer import KzRuSubwordTokenizer
except ImportError:  # Support `python ml/voiceshield_engine.py` from the repo root.
    from subword_tokenizer import KzRuSubwordTokenizer


ROOT = Path(__file__).resolve().parent
DEFAULT_SEED_PATH = ROOT / "seeds" / "voiceshield_seed_kz.json"
DEFAULT_TOKENIZER_MODEL = ROOT / "artifacts" / "tokenizer" / "kzru_unigram.model"
RISK_ORDER = {"none": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}


@dataclass(frozen=True)
class RuleHit:
    rule_id: str
    grammar: str
    subtype: str
    risk: str
    confidence: float
    matched_groups: tuple[str, ...]


@dataclass(frozen=True)
class AnalysisResult:
    fraud_class: str
    fraud_subtype: str
    risk_level: str
    confidence: float
    matched_tokens: list[str]
    triggered_pattern: str
    safe_context: bool
    explanation: str
    rule_hits: list[dict[str, Any]]
    decision: int = 3
    low_confidence: bool = False
    session_elapsed_s: float = 0.0
    force_final: bool = False
    user_action_recommended: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class SessionState:
    """Bounded state for chunked transcript analysis; raw audio is never stored."""

    session_id: str
    chunks: list[str] = field(default_factory=list)
    low_confidence_spans: int = 0
    elapsed_s: float = 0.0
    finalized: bool = False


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).lower().replace("ё", "е")
    value = value.replace("№", " номер ")
    return re.sub(r"[^\w\s%+./:-]", " ", value, flags=re.UNICODE)


def tokenize(value: str) -> list[str]:
    return re.findall(r"[a-zа-яёқғүұңһәөі0-9%]+", normalize_text(value))


def _term_matches(
    term: str,
    token: str,
    subword_tokens: list[str] | None = None,
    tokenizer: KzRuSubwordTokenizer | None = None,
) -> bool:
    term = normalize_text(term).strip()
    if not term or len(term) < 4:
        return term == token
    if token == term or token.startswith(term) or term in token:
        return True
    if " " in term and tokenizer is None:
        return False
    if subword_tokens and tokenizer is not None:
        # With a trained model, compare the term's complete subword sequence.
        # This adds morphology support without changing raw transcript text.
        pieces = _encoded_term(tokenizer, term)
        width = len(pieces)
        return bool(pieces) and any(
            subword_tokens[index : index + width] == pieces
            for index in range(len(subword_tokens) - width + 1)
        )
    return False


def _group_matches(
    group: Iterable[str],
    tokens: list[str],
    subword_tokens: list[str] | None = None,
    tokenizer: KzRuSubwordTokenizer | None = None,
) -> bool:
    return all(
        any(_term_matches(term, token, subword_tokens, tokenizer) for token in tokens)
        for term in group
    )


def _group_label(group: Iterable[str]) -> str:
    return " + ".join(group)


@lru_cache(maxsize=512)
def _encoded_term(tokenizer: KzRuSubwordTokenizer, term: str) -> tuple[str, ...]:
    return tuple(tokenizer.encode(term))


class VoiceShieldEngine:
    """Load and evaluate explicit seed rules with conservative calibration."""

    def __init__(
        self,
        seed_path: Path | str = DEFAULT_SEED_PATH,
        tokenizer_model: Path | str | None = None,
    ) -> None:
        self.seed_path = Path(seed_path)
        with self.seed_path.open(encoding="utf-8") as handle:
            self.seed: dict[str, Any] = json.load(handle)
        self._validate_seed()
        self.rules: list[dict[str, Any]] = list(self.seed["RULES"])
        self.whitelist: dict[str, list[str]] = self.seed.get("VENDOR_WHITELIST", {})
        resolved_tokenizer = Path(tokenizer_model) if tokenizer_model else None
        self.subword_tokenizer = KzRuSubwordTokenizer(resolved_tokenizer) if resolved_tokenizer and resolved_tokenizer.exists() else None

    def _validate_seed(self) -> None:
        required = {
            "SCHEMA_VERSION",
            "PROVENANCE",
            "TOKENS",
            "RULES",
            "BLACKLIST",
            "DECISION_TIERS",
            "SESSION_CONFIG",
        }
        missing = required.difference(self.seed)
        if missing:
            raise ValueError(f"Seed is missing required fields: {sorted(missing)}")
        if self.seed["PROVENANCE"].get("live_decision_use") is not False:
            raise ValueError("Seed must remain disabled for direct live decisions")
        if not isinstance(self.seed["RULES"], list) or not self.seed["RULES"]:
            raise ValueError("Seed RULES must be a non-empty list")

    def _tokens_for_rule(
        self,
        rule: dict[str, Any],
        tokens: list[str],
        subword_tokens: list[str] | None = None,
    ) -> tuple[list[str], bool]:
        matched: list[str] = []
        all_groups = rule.get("all", [])
        if all_groups and not any(
            _group_matches(group, tokens, subword_tokens, self.subword_tokenizer)
            for group in all_groups
        ):
            return matched, False
        if all_groups:
            matched.extend(
                _group_label(group)
                for group in all_groups
                if _group_matches(group, tokens, subword_tokens, self.subword_tokenizer)
            )
        any_groups = rule.get("any", [])
        if any_groups:
            any_matches = [
                group
                for group in any_groups
                if _group_matches(group, tokens, subword_tokens, self.subword_tokenizer)
            ]
            if not any_matches:
                return matched, False
            matched.extend(_group_label(group) for group in any_matches)
        none_groups = rule.get("none", [])
        if any(
            _group_matches(group, tokens, subword_tokens, self.subword_tokenizer)
            for group in none_groups
        ):
            return matched, False
        return matched, bool(matched)

    def _rule_hits(
        self, tokens: list[str], subword_tokens: list[str] | None = None
    ) -> list[RuleHit]:
        hits: list[RuleHit] = []
        for rule in self.rules:
            matched, ok = self._tokens_for_rule(rule, tokens, subword_tokens)
            if ok:
                hits.append(
                    RuleHit(
                        rule_id=str(rule["id"]),
                        grammar=str(rule["grammar"]),
                        subtype=str(rule.get("subtype", "")),
                        risk=str(rule.get("risk", "medium")),
                        confidence=float(rule.get("confidence", 0.5)),
                        matched_groups=tuple(matched),
                    )
                )
        return hits

    def _vendor_context(
        self, tokens: list[str], subword_tokens: list[str] | None = None
    ) -> bool:
        brands = [brand for values in self.whitelist.values() for brand in values]
        return any(
            _group_matches([brand], tokens, subword_tokens, self.subword_tokenizer)
            for brand in brands
        )

    def _blacklist_support(
        self, tokens: list[str], subword_tokens: list[str] | None = None
    ) -> tuple[float, str]:
        """Compare token shingles, including multi-word seed entries."""
        best_score, best_type = 0.0, ""
        for pattern in self.seed["BLACKLIST"].get("patterns", []):
            pattern_tokens = [
                token
                for phrase in pattern.get("tokens", [])
                for token in tokenize(phrase)
            ]
            if not pattern_tokens:
                continue
            matched = sum(
                1
                for token in pattern_tokens
                if any(
                    _term_matches(token, text, subword_tokens, self.subword_tokenizer)
                    for text in tokens
                )
            )
            score = matched / len(pattern_tokens)
            if score > best_score:
                best_score = score
                best_type = str(pattern.get("subtype", pattern.get("type", "")))
        return best_score, best_type

    def _analyze_text(self, text: str) -> AnalysisResult:
        tokens = tokenize(text)
        subword_tokens = (
            self.subword_tokenizer.encode(text) if self.subword_tokenizer else None
        )
        if not tokens:
            return AnalysisResult(
                "UNKNOWN", "", "none", 0.0, [], "none", False, "Пустой текст", []
            )

        hits = self._rule_hits(tokens, subword_tokens)
        fraud_hits = [hit for hit in hits if hit.risk != "none"]
        safe_hits = [hit for hit in hits if hit.risk == "none"]
        blacklist_score, blacklist_type = self._blacklist_support(
            tokens, subword_tokens
        )
        vendor = self._vendor_context(tokens, subword_tokens)

        # A sender/brand name is not proof of safety. Fraud evidence always wins.
        if fraud_hits:
            top = max(
                fraud_hits,
                key=lambda hit: (RISK_ORDER.get(hit.risk, 0), hit.confidence),
            )
            corroboration = min(0.08, max(0, len(fraud_hits) - 1) * 0.04)
            confidence = min(
                0.98,
                top.confidence
                + corroboration
                + (0.04 if blacklist_score >= 0.5 else 0),
            )
            matched = [group for hit in fraud_hits for group in hit.matched_groups][:8]
            return AnalysisResult(
                top.grammar,
                top.subtype,
                top.risk,
                round(confidence, 3),
                matched,
                top.rule_id
                if blacklist_score < 0.5
                else f"{top.rule_id}+{blacklist_type}",
                False,
                self._explanation(top, vendor),
                [asdict(hit) for hit in hits],
            )

        if safe_hits:
            top = max(safe_hits, key=lambda hit: hit.confidence)
            confidence = min(0.96, top.confidence + (0.02 if vendor else 0))
            return AnalysisResult(
                "SAFE",
                top.subtype,
                "none",
                round(confidence, 3),
                list(top.matched_groups),
                top.rule_id,
                vendor,
                "Похоже на обычное уведомление; опасных действий в тексте не найдено",
                [asdict(hit) for hit in hits],
            )

        if blacklist_score >= float(self.seed["BLACKLIST"].get("min_sim_score", 0.4)):
            return AnalysisResult(
                "NEEDS_REVIEW",
                blacklist_type,
                "medium",
                round(min(0.75, 0.45 + blacklist_score * 0.25), 3),
                tokens[:8],
                blacklist_type,
                vendor,
                "Найдено сходство с известным паттерном; нужна проверка контекста",
                [],
            )

        return AnalysisResult(
            "UNKNOWN",
            "",
            "none",
            0.25,
            [],
            "none",
            vendor,
            "Явных сигналов из текущего seed не найдено",
            [],
        )

    def _decision_for(
        self, result: AnalysisResult, low_confidence: bool = False
    ) -> int:
        """Map evidence to a UI tier. This never initiates an automatic call action."""
        if low_confidence and result.risk_level in {"none", "low"}:
            return 3
        if result.risk_level == "critical":
            return 5
        if result.risk_level == "high":
            return 4
        if result.risk_level == "low":
            return 4 if result.fraud_subtype == "TELEMARKETING" else 3
        if result.risk_level == "medium":
            return 3
        if result.safe_context and result.confidence >= 0.95:
            return 1
        if result.risk_level == "none" and result.confidence >= 0.8:
            return 2
        return 3

    def analyze(
        self,
        text: str,
        *,
        low_confidence: bool = False,
        session_elapsed_s: float = 0.0,
        force_final: bool = False,
    ) -> AnalysisResult:
        result = self._analyze_text(text)
        decision = self._decision_for(result, low_confidence)
        return replace(
            result,
            decision=decision,
            low_confidence=low_confidence,
            session_elapsed_s=max(0.0, session_elapsed_s),
            force_final=force_final,
            user_action_recommended=decision >= 4,
        )

    def start_session(self, session_id: str) -> SessionState:
        return SessionState(session_id=session_id)

    def analyze_chunk(
        self,
        state: SessionState,
        text: str,
        *,
        confidence: float = 1.0,
        elapsed_s: float | None = None,
        force_final: bool = False,
    ) -> AnalysisResult:
        if state.finalized:
            raise ValueError("Cannot append a chunk to a finalized session")
        max_chunks = int(self.seed["SESSION_CONFIG"].get("max_chunks", 120))
        if len(state.chunks) >= max_chunks:
            raise ValueError("Session chunk limit exceeded")
        clean_text = text.strip()
        if clean_text:
            state.chunks.append(clean_text)
        threshold = float(
            self.seed["SESSION_CONFIG"].get("low_confidence_threshold", 0.35)
        )
        bounded_confidence = max(0.0, min(1.0, confidence))
        if bounded_confidence < threshold:
            state.low_confidence_spans += 1
        if elapsed_s is None:
            interval_s = (
                float(self.seed["SESSION_CONFIG"].get("chunk_interval_ms", 3000)) / 1000
            )
            state.elapsed_s += interval_s
        else:
            state.elapsed_s = max(state.elapsed_s, max(0.0, elapsed_s))
        timeout_s = float(self.seed["SESSION_CONFIG"].get("force_final_timeout_s", 15))
        should_finalize = force_final or state.elapsed_s >= timeout_s
        result = self.analyze(
            " ".join(state.chunks),
            low_confidence=state.low_confidence_spans > 0,
            session_elapsed_s=state.elapsed_s,
            force_final=should_finalize,
        )
        # A timeout finalizes the current evidence; it must not manufacture a
        # spam verdict when the transcript contains no fraud signal.
        if should_finalize:
            state.finalized = True
        return result

    @staticmethod
    def _explanation(hit: RuleHit, vendor: bool) -> str:
        explanations = {
            "GRM_BANK_FRAUD_KZ": "Запрос от имени банка связан с переводом, кодом или защитным счётом",
            "GRM_POLICE_SCAM_KZ": "Используется давление от имени полиции или следствия",
            "GRM_EGOV_SCAM_KZ": "Есть признаки фишинга под видом eGov или государственной услуги",
            "GRM_INVEST_SCAM_KZ": "Обещаются гарантированный доход или инвестиционная выгода",
            "GRM_SMISHING_KZ": "Сообщение подталкивает открыть ссылку или установить приложение",
            "GRM_OTP_KZ": "Запрашивается одноразовый код или подтверждение",
            "GRM_LOTTERY_SCAM_KZ": "Лотерейный скам — сообщение о выигрыше с требованием комиссии",
            "GRM_RECOVERY_SCAM_KZ": "Скам компенсации — ложный возврат средств или налоговый вычет",
            "GRM_TELEMARKETING_KZ": "Телемаркетинг или рекламный робозвонок",
        }
        suffix = "; название известного бренда не отменяет риск" if vendor else ""
        return explanations.get(hit.grammar, "Найден опасный языковой паттерн") + suffix


def self_test() -> None:
    engine = VoiceShieldEngine()
    cases = [
        ("safe_transaction", "Kaspi: Списание 5000 тг на АЗС. Баланс 45000 тг", "SAFE"),
        (
            "safe_otp",
            "Ваш код подтверждения Kaspi для входа: 4521. Никому не сообщайте",
            "SAFE",
        ),
        (
            "bank",
            "Служба безопасности банка: срочно переведите деньги на безопасный счет",
            "GRM_BANK_FRAUD_KZ",
        ),
        (
            "police",
            "Я следователь, родственник задержан, срочно нужен залог",
            "GRM_POLICE_SCAM_KZ",
        ),
        ("egov", "Перейдите по ссылке egov и введите код", "GRM_EGOV_SCAM_KZ"),
        (
            "investment",
            "Гарантированный доход от инвестиций, вложите деньги",
            "GRM_INVEST_SCAM_KZ",
        ),
        (
            "smishing",
            "Скачайте приложение и перейдите по ссылке для входа",
            "GRM_SMISHING_KZ",
        ),
        (
            "brand_override",
            "Kaspi: срочно переведите деньги на безопасный счет",
            "GRM_BANK_FRAUD_KZ",
        ),
        (
            "lottery",
            "Поздравляем! Вы выиграли приз 500 000 тенге. Для получения переведите комиссию 5000 тг",
            "GRM_LOTTERY_SCAM_KZ",
        ),
        (
            "recovery",
            "Вам положена компенсация, оплатите небольшой налог для получения выплаты",
            "GRM_RECOVERY_SCAM_KZ",
        ),
        (
            "telemarketing",
            "Специальное предложение, срочно звоните нашему представителю",
            "GRM_TELEMARKETING_KZ",
        ),
    ]
    for name, text, expected in cases:
        result = engine.analyze(text)
        assert result.fraud_class == expected, f"{name}: {result}"
    print(f"VoiceShield engine self-test: {len(cases)}/{len(cases)} passed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("text", nargs="*")
    parser.add_argument("--seed", type=Path, default=DEFAULT_SEED_PATH)
    parser.add_argument("--tokenizer-model", type=Path, default=DEFAULT_TOKENIZER_MODEL)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        result = VoiceShieldEngine(args.seed, args.tokenizer_model).analyze(
            " ".join(args.text)
        )
        print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
