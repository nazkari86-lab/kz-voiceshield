"""Source-backed Kazakhstan fraud scenario catalog and safe bootstrap generator.

Generated dialogue is synthetic and never trusted as ground truth. Each row
keeps the official source, publication date, channel, tactics and requested
actions so reviewers can trace a training example back to evidence.
"""
from __future__ import annotations

import argparse
import json
import random
import re
from dataclasses import asdict, dataclass
from pathlib import Path

SCHEMA_VERSION = "voiceshield.dataset.v2"
ALLOWED_LANGS = {"ru", "kz"}
SECRET_PATTERN = re.compile(r"\b(?:\d[ -]?){6,}\b")


@dataclass(frozen=True)
class ScenarioSpec:
    id: str
    title: str
    source_url: str
    source_date: str
    channel: str
    scheme: str
    tactics: tuple[str, ...]
    requested_actions: tuple[str, ...]
    ru_templates: tuple[str, ...]
    kz_templates: tuple[str, ...]


OFFICIAL_SCENARIOS: tuple[ScenarioSpec, ...] = (
    ScenarioSpec(
        "fake-afm-safe-account-2024", "Fake AFM account restriction",
        "https://www.gov.kz/memleket/entities/afm/press/news/details/816294?lang=ru", "2024",
        "phone", "fake_bank_employee", ("authority_impersonation", "urgency", "secrecy"),
        ("send_bank_details", "transfer_money"),
        ("Это Агентство по финансовому мониторингу. Операции по вашему счёту якобы ограничены. Срочно назовите реквизиты и переведите деньги на резервный счёт. Никому не рассказывайте.",),
        ("Бұл Қаржылық мониторинг агенттігі. Шотыңызға шектеу қойылды деп хабарлайды. Деректемелерді айтып, ақшаны резервтік шотқа дереу аударыңыз. Ешкімге айтпаңыз.",),
    ),
    ScenarioSpec(
        "fake-leader-telegram-2026", "Fake manager in Telegram",
        "https://www.gov.kz/memleket/entities/qriim/press/news/details/1256958?lang=ru", "2026",
        "telegram", "marketplace_scam", ("authority_impersonation", "urgency", "secrecy"),
        ("transfer_money",),
        ("Это ваш руководитель. Я сейчас на совещании, срочно оплатите счёт и переведите деньги на эти реквизиты. Не звоните, отвечайте только здесь.",),
        ("Бұл сіздің басшыңыз. Қазір жиналыстамын, шотты шұғыл төлеп, ақшаны мына деректемеге аударыңыз. Қоңырау шалмаңыз, тек осында жауап беріңіз.",),
    ),
    ScenarioSpec(
        "fake-official-safe-account-2025", "Fake official and safe account",
        "https://www.gov.kz/memleket/entities/qriim/press/news/details/1192225?lang=ru", "2025",
        "phone", "safe_account", ("authority_impersonation", "caller_id_spoofing", "urgency"),
        ("transfer_money", "isolate_victim"),
        ("Мы из государственного органа. Из-за утечки данных ваш счёт сейчас заблокируют. Переведите все деньги на безопасный счёт и никому не сообщайте.",),
        ("Мемлекеттік органнан хабарласып тұрмыз. Деректердің таралуына байланысты шотыңыз бұғатталады. Барлық ақшаны қауіпсіз шотқа аударып, ешкімге айтпаңыз.",),
    ),
    ScenarioSpec(
        "fake-kgd-esalyq-2026", "Fake tax confirmation and APK",
        "https://www.gov.kz/memleket/entities/kgd/press/news/details/1217695?lang=ru", "2026",
        "phone", "fake_egov", ("authority_impersonation", "malicious_download", "urgency"),
        ("install_app", "send_code", "send_esignature"),
        ("Это налоговая служба. Подтвердите деятельность через приложение, которое мы отправим. Установите APK и продиктуйте код SMS, иначе работу приостановят.",),
        ("Бұл салық қызметі. Қызметіңізді біз жіберетін қолданба арқылы растаңыз. APK орнатып, SMS кодын айтыңыз, әйтпесе жұмысыңыз тоқтатылады.",),
    ),
    ScenarioSpec(
        "phishing-sms-official-brands-2026", "Phishing SMS from public brands",
        "https://www.gov.kz/situations/733/1529", "2026",
        "sms", "fake_egov", ("brand_impersonation", "malicious_link", "urgency"),
        ("open_link", "send_card_details"),
        ("Ваш платёж не прошёл. Откройте ссылку от имени 1414, eGov или QazPost и введите данные карты для подтверждения.",),
        ("Төлеміңіз өтпеді. 1414, eGov немесе QazPost атынан келген сілтемені ашып, растау үшін карта деректерін енгізіңіз.",),
    ),
    ScenarioSpec(
        "spoofed-call-infrastructure-2026", "Local-looking spoofed calls",
        "https://www.gov.kz/memleket/entities/knb/press/news/details/1210123?lang=ru", "2026",
        "phone", "fake_bank_employee", ("caller_id_spoofing", "mass_dialing"),
        ("continue_call",),
        ("На экране отображается официальный номер, поэтому немедленно подтвердите данные и оставайтесь на линии.",),
        ("Экранда ресми нөмір көрсетілген, сондықтан деректерді дереу растаңыз және желіден шықпаңыз.",),
    ),
)

SAFE_TEMPLATES = {
    "ru": (
        "Это клиника. Напоминаем о записи на {time}. Перенести визит можно через официальный номер, коды и данные карты не нужны.",
        "Ваш заказ прибыл в пункт выдачи. Заберите его по документу на месте, SMS-код никому сообщать не нужно.",
        "Это школа. Родительское собрание перенесено на {time}. Для уточнения используйте официальный номер школы.",
    ),
    "kz": (
        "Бұл клиника. {time} уақытындағы қабылдауды еске саламыз. Ресми нөмір арқылы ауыстыруға болады, код пен карта деректері қажет емес.",
        "Тапсырысыңыз жеткізу пунктіне келді. Оны құжатпен алыңыз, SMS кодын ешкімге айтудың қажеті жоқ.",
        "Бұл мектеп. Ата-аналар жиналысы {time} уақытына ауыстырылды. Ақпаратты мектептің ресми нөмірінен тексеріңіз.",
    ),
}


def catalog_rows() -> list[dict]:
    return [{"id": item.id, "title": item.title, "source": item.source_url, "date": item.source_date,
             "channel": item.channel, "scheme": item.scheme, "tactics": list(item.tactics),
             "requestedActions": list(item.requested_actions)} for item in OFFICIAL_SCENARIOS]


def _safe_fill(text: str, rng: random.Random) -> str:
    return text.format(time=rng.choice(("09:00", "10:30", "14:00", "18:00")))


def generate_bootstrap(per_scenario: int = 4, safe_count: int = 24, seed: int = 42) -> list[dict]:
    """Create traceable synthetic fraud rows plus hard-negative safe rows."""
    if per_scenario < 1 or safe_count < 1:
        raise ValueError("per_scenario and safe_count must be positive")
    rng = random.Random(seed)
    rows: list[dict] = []
    counter = 0
    for spec in OFFICIAL_SCENARIOS:
        for index in range(per_scenario):
            lang = "ru" if index % 2 == 0 else "kz"
            templates = spec.ru_templates if lang == "ru" else spec.kz_templates
            transcript = templates[index % len(templates)]
            rows.append({
                "id": f"official-synthetic-{counter:05d}", "schemaVersion": SCHEMA_VERSION,
                "transcript": transcript, "label": "true_positive", "score": 90,
                "lang": lang, "scheme": spec.scheme, "sourceScenario": spec.id,
                "tactics": list(spec.tactics), "requestedActions": list(spec.requested_actions),
                "channel": spec.channel,
                "provenance": {"origin": "official_synthetic", "trusted": False,
                                "sourceUrl": spec.source_url, "sourceDate": spec.source_date},
            })
            counter += 1
    for index in range(safe_count):
        lang = "ru" if index % 2 == 0 else "kz"
        transcript = _safe_fill(SAFE_TEMPLATES[lang][index % len(SAFE_TEMPLATES[lang])], rng)
        rows.append({
            "id": f"hard-negative-{index:05d}", "schemaVersion": SCHEMA_VERSION,
            "transcript": transcript, "label": "false_positive", "score": 0,
            "lang": lang, "scheme": "unclassified", "sourceScenario": "hard_negative_safe",
            "tactics": [], "requestedActions": [], "channel": "phone",
            "provenance": {"origin": "official_synthetic", "trusted": False,
                            "sourceUrl": "generated-from-safe-control-templates", "sourceDate": "2026"},
        })
    return rows


def validate_rows(rows: list[dict]) -> list[str]:
    errors: list[str] = []
    known_ids = {item.id for item in OFFICIAL_SCENARIOS}
    for index, row in enumerate(rows, start=1):
        if row.get("schemaVersion") != SCHEMA_VERSION:
            errors.append(f"row {index}: unsupported schema")
        if row.get("lang") not in ALLOWED_LANGS:
            errors.append(f"row {index}: unsupported language")
        if not str(row.get("transcript", "")).strip():
            errors.append(f"row {index}: empty transcript")
        if row.get("label") == "true_positive" and row.get("sourceScenario") not in known_ids:
            errors.append(f"row {index}: fraud row has unknown sourceScenario")
        if row.get("provenance", {}).get("trusted") is True:
            errors.append(f"row {index}: generated row cannot be trusted")
        if SECRET_PATTERN.search(str(row.get("transcript", ""))):
            errors.append(f"row {index}: transcript contains a numeric secret-like sequence")
    return errors


def main() -> None:
    parser = argparse.ArgumentParser(description="Build source-backed Kazakhstan fraud scenario bootstrap JSONL")
    parser.add_argument("--per-scenario", type=int, default=4)
    parser.add_argument("--safe", type=int, default=24)
    parser.add_argument("--out", type=Path, default=Path("ml/artifacts/kz_fraud_bootstrap.jsonl"))
    args = parser.parse_args()
    rows = generate_bootstrap(args.per_scenario, args.safe)
    errors = validate_rows(rows)
    if errors:
        raise SystemExit("\n".join(errors))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n", encoding="utf-8")
    print(json.dumps({"out": str(args.out), "rows": len(rows), "scenarios": len(OFFICIAL_SCENARIOS)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
