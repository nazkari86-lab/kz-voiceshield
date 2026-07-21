"""Small, allow-listed MCP-compatible gateway for VoiceShield.

The gateway intentionally exposes analysis and read-only context tools only.
It is not a shell bridge and never accepts arbitrary Python, SQL, URLs, or file
paths from an assistant.
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable

from .privacy import detect_language, redact_text

MAX_TEXT_CHARS = 12_000

_RISK_PATTERNS: tuple[tuple[str, int, str], ...] = (
    (r"(?:код|парол|cvv|реквизит|sms)", 35, "requests a secret or payment credential"),
    (r"(?:переведите|оплатите|погасите|несие|займ|аударыңыз)", 30, "requests money or a transfer"),
    (r"(?:anydesk|teamviewer|rustdesk|удаленн\w* доступ)", 45, "requests remote access"),
    (r"(?:срочно|немедленно|сейчас|иначе|urgent|шұғыл)", 10, "uses urgency"),
    (r"(?:https?://|www\.)", 10, "contains a link"),
)

FEATURES: tuple[dict[str, Any], ...] = (
    {"id": "live-shield", "title": "Live Shield", "summary": "Анализирует доступный аудиоканал и показывает риск; для звука собеседника на Android обычно нужна громкая связь."},
    {"id": "sms-scanner", "title": "SMS Scanner", "summary": "Проверяет SMS на давление, коды, платежи, ссылки, APK и удаленный доступ; обычный OTP сам по себе не является мошенничеством."},
    {"id": "number-shield", "title": "Number Shield", "summary": "Проверяет номер по локальной репутации, контактам, пользовательским правилам и истории жалоб."},
    {"id": "ai-assistant", "title": "AI Assistant", "summary": "Объясняет транскрипты, SMS, номера и доказательства локальной или явно разрешенной облачной моделью."},
    {"id": "model-catalog", "title": "Model Catalog", "summary": "Показывает и проверяет локальные ASR/GGUF-модели, требования к RAM, свободное место и SHA-256."},
    {"id": "cases", "title": "Cases and Evidence", "summary": "Хранит дела, решения, timeline, audit trail и redacted evidence bundle."},
    {"id": "voip", "title": "VoiceShield VoIP", "summary": "Создает защищенную VoIP-комнату только при настроенном LiveKit backend; обычный SIM-звонок автоматически не переводится."},
    {"id": "improve-lab", "title": "Improve VoiceShield Lab", "summary": "Экспортирует только явно выбранные и обезличенные кейсы; автоматической отправки разговоров нет."},
)

RELEASES: tuple[dict[str, str], ...] = (
    {"version": "2.2.3", "title": "Hybrid classifier and transcript reliability release", "summary": "Добавляет semantic fusion, auxiliary classifiers, ML shadow review и более надёжную обработку длинных AI-ответов без изменения Live Shield audio lifecycle."},
    {"version": "2.2.1", "title": "Training voice and assistant quality release", "summary": "Добавляет Microsoft Edge TTS без ключа, ветвящиеся тренировки, голосовые ответы и локальные evidence-пакеты без доступа к Live Shield audio pipeline."},
    {"version": "2.0.8", "title": "Caption-source hardening", "summary": "Фильтрует текст панели уведомлений и чужих приложений, чтобы не создавать ложный Live Caption transcript."},
    {"version": "2.0.2", "title": "Verified baseline", "summary": "Сохраненная пользователем Xiaomi baseline для сравнения и отката."},
    {"version": "2.0.0", "title": "Historical baseline", "summary": "Историческая private-beta baseline; полный diff старых версий не утверждается без артефактов."},
)


def _text(arguments: dict[str, Any], key: str = "text") -> str:
    value = arguments.get(key, "")
    if not isinstance(value, str):
        raise ValueError(f"{key} must be a string")
    value = value.strip()
    if len(value) > MAX_TEXT_CHARS:
        raise ValueError(f"{key} exceeds {MAX_TEXT_CHARS} characters")
    return value


def _analyze_transcript(arguments: dict[str, Any]) -> dict[str, Any]:
    text = _text(arguments)
    reasons: list[str] = []
    score = 0
    for pattern, weight, reason in _RISK_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            score += weight
            reasons.append(reason)
    score = min(score, 100)
    verdict = "fraud" if score >= 70 else "needs_review" if score >= 30 else "safe"
    return {"verdict": verdict, "score": score, "confidence": min(95, 55 + len(reasons) * 8), "reasons": reasons, "language": detect_language(text)}


def _app_knowledge(arguments: dict[str, Any]) -> dict[str, Any]:
    query = _text(arguments, "query").lower()
    features = [item for item in FEATURES if not query or query in f"{item['id']} {item['title']} {item['summary']}".lower()]
    releases = [item for item in RELEASES if not query or query in f"{item['version']} {item['title']} {item['summary']}".lower()]
    return {"app": "KZ VoiceShield", "version": "2.2.3", "features": features, "releases": releases}


def _redact(arguments: dict[str, Any]) -> dict[str, Any]:
    return {"text": redact_text(_text(arguments)), "redacted": True}


TOOL_HANDLERS: dict[str, tuple[dict[str, Any], Callable[[dict[str, Any]], dict[str, Any]]]] = {
    "voiceshield_analyze_transcript": ({"name": "voiceshield_analyze_transcript", "description": "Rule-based triage of RU/KZ text. Does not end calls or change device state.", "inputSchema": {"type": "object", "properties": {"text": {"type": "string", "maxLength": MAX_TEXT_CHARS}}, "required": ["text"]}}, _analyze_transcript),
    "voiceshield_app_knowledge": ({"name": "voiceshield_app_knowledge", "description": "Read-only VoiceShield features and release history.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string", "maxLength": 200}}}}, _app_knowledge),
    "voiceshield_redact_text": ({"name": "voiceshield_redact_text", "description": "Redact common phone, card, IIN and secret-code patterns before cloud sharing.", "inputSchema": {"type": "object", "properties": {"text": {"type": "string", "maxLength": MAX_TEXT_CHARS}}, "required": ["text"]}}, _redact),
}


def mcp_response(request_id: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def mcp_error(request_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def handle_mcp(payload: dict[str, Any], backend_status: dict[str, Any]) -> dict[str, Any]:
    request_id = payload.get("id")
    method = payload.get("method")
    if not isinstance(method, str):
        return mcp_error(request_id, -32600, "Invalid MCP request")
    if method == "initialize":
        return mcp_response(request_id, {"protocolVersion": "2025-06-18", "capabilities": {"tools": {}}, "serverInfo": {"name": "voiceshield-mcp", "version": backend_status.get("version", "unknown")}})
    if method == "notifications/initialized":
        return mcp_response(request_id, {})
    if method == "tools/list":
        return mcp_response(request_id, {"tools": [schema for schema, _ in TOOL_HANDLERS.values()] + [{"name": "voiceshield_backend_status", "description": "Read-only backend and model capability status.", "inputSchema": {"type": "object", "properties": {}}}]})
    if method == "tools/call":
        params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
        name = params.get("name")
        if name == "voiceshield_backend_status":
            output = backend_status
        elif isinstance(name, str) and name in TOOL_HANDLERS:
            try:
                output = TOOL_HANDLERS[name][1](params.get("arguments") if isinstance(params.get("arguments"), dict) else {})
            except ValueError as error:
                return mcp_error(request_id, -32602, str(error))
        else:
            return mcp_error(request_id, -32601, "Tool is not available")
        return mcp_response(request_id, {"content": [{"type": "text", "text": json.dumps(output, ensure_ascii=False)}], "structuredContent": output, "isError": False})
    return mcp_error(request_id, -32601, "Method is not available")
