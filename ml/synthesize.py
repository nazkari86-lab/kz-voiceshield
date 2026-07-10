"""Generate synthetic RU/KZ scam + safe transcripts for bootstrapping.

Synthetic data is deterministic (seeded), template-based, and clearly labelled
with provenance {"origin": "synthetic", "trusted": false}. It is meant for
pretraining / smoke tests ONLY — the trusted evaluation set must be real,
reviewer-labelled RU/KZ calls. Never place synthetic rows in a held-out test set.

Usage:
    python ml/synthesize.py --per-scheme 12 --safe 60 --out ml/artifacts/synthetic.jsonl
"""
from __future__ import annotations

import argparse
import itertools
import json
import random
from pathlib import Path

from schemes import LABEL_FRAUD, LABEL_SAFE, SCHEMES, LANGS

SCHEMA_VERSION = "voiceshield.dataset.v2"

# A few realistic templates per scheme, per language. {slots} are filled below.
SCAM: dict[str, dict[str, list[str]]] = {
    "fake_bank_employee": {
        "ru": [
            "Здравствуйте, это служба безопасности {bank}. По вашей карте зафиксирована подозрительная операция на {amount} тенге. Назовите код из SMS, чтобы мы её отменили.",
            "Вас беспокоит сотрудник {bank}. Кто-то пытается оформить кредит на ваше имя. Продиктуйте код подтверждения, иначе деньги спишут.",
        ],
        "kz": [
            "Сәлеметсіз бе, {bank} қауіпсіздік қызметі. Картаңыздан {amount} теңге күдікті аударым тіркелді. SMS кодын айтыңыз, біз оны тоқтатамыз.",
            "{bank} қызметкері мазалап тұр. Сіздің атыңызға несие рәсімделуде. Растау кодын жіберіңіз, әйтпесе ақша шегеріледі.",
        ],
    },
    "safe_account": {
        "ru": [
            "Чтобы защитить деньги, срочно переведите всё на безопасный счёт, который я вам продиктую. Не кладите трубку и никому не говорите.",
            "Ваш счёт под угрозой. Единственный способ спасти средства — перевести их на резервный безопасный счёт прямо сейчас.",
        ],
        "kz": [
            "Ақшаңызды сақтау үшін оны мен айтатын қауіпсіз шотқа дереу аударыңыз. Тұтқаны қоймаңыз, ешкімге айтпаңыз.",
            "Шотыңызға қауіп төніп тұр. Қаражатты сақтаудың жалғыз жолы — оны қазір резервтік қауіпсіз шотқа аудару.",
        ],
    },
    "fake_police": {
        "ru": [
            "Это дежурная часть полиции. На ваше имя возбуждено уголовное дело о переводе денег террористам. Не кладите трубку, для отмены переведите средства на безопасный счёт.",
            "Звонит следователь. Ваш родственник задержан. Для освобождения до суда срочно переведите деньги, иначе уголовная ответственность.",
        ],
        "kz": [
            "Бұл полиция кезекші бөлімі. Атыңызға террористерге ақша аудару туралы қылмыстық іс қозғалды. Тұтқаны қоймаңыз, болдырмау үшін қаражатты қауіпсіз шотқа аударыңыз.",
            "Тергеуші хабарласып тұр. Туысыңыз ұсталды. Сотқа дейін босату үшін ақшаны дереу аударыңыз, әйтпесе қылмыстық жауапкершілік.",
        ],
    },
    "investment_scam": {
        "ru": [
            "Мы представитель инвестиционной платформы. Сегодня доход {percent} процентов. Переведите депозит через Kaspi, менеджер пришлёт ссылку в Telegram. Предложение конфиденциально.",
            "Ваши инвестиции выросли, но чтобы вывести прибыль, нужно оплатить комиссию {amount} тенге на указанный счёт.",
        ],
        "kz": [
            "Біз инвестициялық платформа өкіліміз. Бүгін табыс {percent} пайыз. Депозитті Kaspi арқылы аударыңыз, менеджер Telegram сілтемесін жібереді. Ұсыныс құпия.",
            "Инвестицияңыз өсті, бірақ пайданы шығару үшін {amount} теңге комиссия төлеу қажет.",
        ],
    },
    "family_emergency": {
        "ru": [
            "Апа, это я, голос плохо слышно, я попал в аварию. Срочно нужны деньги, переведи на Kaspi. Мой номер не работает, никому не звони.",
            "Мама, я в беде, меня задержали. Не говори папе. Нужно срочно перевести {amount} тенге адвокату.",
        ],
        "kz": [
            "Апа, бұл мен, дауысым нашар естіледі, жол апатына ұшырадым. Ақша керек, Kaspi-ге аудар. Нөмірім жұмыс істемейді, ешкімге қоңырау шалма.",
            "Ана, бастан қиындық түсті, ұсталып қалдым. Әкеme айтпа. {amount} теңгені адвокатқа дереу аудару керек.",
        ],
    },
    "courier_otp": {
        "ru": [
            "Курьерская служба. Ваша посылка задержана на таможне. Оплатите сбор по ссылке и назовите ИИН и код из SMS для подтверждения доставки.",
            "Ваш заказ не может быть доставлен. Подтвердите получение — продиктуйте код из сообщения, иначе посылку вернут.",
        ],
        "kz": [
            "Курьерлік қызмет. Сәлемдемеңіз кеденде кідірді. Алымды сілтеме арқылы төлеп, ЖСН мен SMS кодын айтыңыз.",
            "Тапсырысыңыз жеткізілмейді. Алғаныңызды растаңыз — хабарламадағы кодты айтыңыз, әйтпесе қайтарылады.",
        ],
    },
    "remote_access": {
        "ru": [
            "Чтобы защитить телефон, установите приложение AnyDesk и продиктуйте код доступа, я подключусь и всё настрою.",
            "Для отмены операции скачайте программу удалённого доступа и дайте мне номер, который появится на экране.",
        ],
        "kz": [
            "Телефонды қорғау үшін AnyDesk қолданбасын орнатып, кіру кодын айтыңыз, мен қосылып бәрін реттеймін.",
            "Операцияны болдырмау үшін қашықтан қосылу бағдарламасын жүктеп, экрандағы нөмірді айтыңыз.",
        ],
    },
    "sim_swap": {
        "ru": [
            "Это оператор {bank}. Зафиксирована заявка на замену вашей SIM-карты. Если это не вы, назовите ИИН и код из SMS для отмены, иначе номер заблокируют.",
            "Ваша SIM будет перевыпущена через 30 минут. Для отмены подтвердите личность кодом из сообщения.",
        ],
        "kz": [
            "Бұл {bank} операторы. SIM-картаңызды ауыстыруға өтінім тіркелді. Бұл сіз болмасаңыз, болдырмау үшін ЖСН мен кодты айтыңыз.",
            "SIM картаңыз 30 минуттан кейін қайта шығарылады. Болдырмау үшін хабарламадағы кодпен жеке басыңызды растаңыз.",
        ],
    },
    "fake_egov": {
        "ru": [
            "Звонит специалист портала eGov. На ваше имя зарегистрирована выплата {amount} тенге. Назовите ИИН, номер удостоверения и код из SMS для зачисления.",
            "Вам одобрена субсидия. Чтобы получить деньги сегодня, продиктуйте код подтверждения из сообщения.",
        ],
        "kz": [
            "eGov порталының маманы хабарласып тұр. Атыңызға {amount} теңге төлем тіркелді. ЖСН, куәлік нөмірі мен SMS кодын айтыңыз.",
            "Сізге субсидия мақұлданды. Ақшаны бүгін алу үшін хабарламадағы растау кодын айтыңыз.",
        ],
    },
    "marketplace_scam": {
        "ru": [
            "Вы откликнулись на вакансию оператора. Зарплата {amount} тенге. Для оформления оплатите обучение через Kaspi по QR-коду в WhatsApp.",
            "Покупатель готов забрать товар, но переведите предоплату за доставку на указанные реквизиты OLX.",
        ],
        "kz": [
            "Сіз оператор бос орнына өтініш білдірдіңіз. Жалақы {amount} теңге. Рәсімдеу үшін WhatsApp-тағы QR арқылы оқуды төлеңіз.",
            "Сатып алушы тауарды алуға дайын, бірақ жеткізу үшін алдын ала төлемді OLX деректемелеріне аударыңыз.",
        ],
    },
    "messenger_takeover": {
        "ru": [
            "Я из поддержки WhatsApp. Ваш аккаунт будет заблокирован. Отправьте код подтверждения из SMS и перейдите по ссылке для восстановления.",
            "Ваш Telegram взломан. Чтобы вернуть доступ, продиктуйте код, который только что пришёл вам в сообщении.",
        ],
        "kz": [
            "Мен WhatsApp қолдау қызметіненмін. Аккаунтыңыз бұғатталады. SMS растау кодын жіберіп, қалпына келтіру сілтемесіне өтіңіз.",
            "Telegram аккаунтыңыз бұзылды. Қол жеткізу үшін жаңа ғана келген кодты айтыңыз.",
        ],
    },
}

SAFE = {
    "ru": [
        "Здравствуйте, это оператор клиники. Напоминаем о записи на завтра в {time}. Если неудобно, перезапишитесь через официальный номер на сайте.",
        "Добрый день, ваш заказ доставлен в пункт выдачи. Заберите его в течение недели, код получения покажите на месте, никому не сообщайте SMS-коды.",
        "Это школа вашего ребёнка. Родительское собрание переносится на {time}. Спасибо за внимание.",
        "Здравствуйте, служба доставки воды. Подтвердите, что вам удобно принять заказ завтра утром?",
        "Это библиотека, напоминаем вернуть книгу до конца недели, продлить можно на официальном сайте.",
        "Здравствуйте, {name}? Это из автосервиса, ваша машина готова, можете забрать {day} после {time}.",
        "Добрый день, {name}. Столик забронирован на {day} на {time}, ждём вас, подтверждать код не нужно.",
    ],
    "kz": [
        "Сәлеметсіз бе, клиника операторы. Ертеңгі {time} қабылдауды еске саламыз. Ыңғайсыз болса, ресми нөмір арқылы қайта жазылыңыз.",
        "Қайырлы күн, тапсырысыңыз тапсыру пунктіне жеткізілді. Апта ішінде алыңыз, SMS кодын ешкімге айтпаңыз.",
        "Бұл балаңыздың мектебі. Ата-аналар жиналысы {time} уақытына ауыстырылды. Назарыңызға рахмет.",
        "Сәлеметсіз бе, су жеткізу қызметі. Ертең таңертең тапсырысты қабылдауға ыңғайлы ма?",
        "Бұл кітапхана, кітапты апта соңына дейін қайтаруды еске саламыз, ресми сайтта ұзартуға болады.",
        "Сәлеметсіз бе, {name}? Автосервистен, көлігіңіз дайын, {day} {time} кейін ала аласыз.",
        "Қайырлы күн, {name}. Үстел {day} {time} сағатқа брондалды, кодты растау қажет емес.",
    ],
}

BANKS = ["банка", "Kaspi", "Halyk", "Jusan", "оператора связи"]
AMOUNTS = ["150 000", "350 000", "50 000", "1 200 000", "89 900"]
PERCENTS = ["30", "45", "20", "60"]
TIMES = ["10:30", "9:00", "14:15", "18:00", "11:45", "16:20"]
NAMES = ["Айгерім", "Данияр", "Марат", "Асель", "Нұрлан", "Дария"]
DAYS = ["завтра", "в понедельник", "в среду", "в пятницу", "ертең", "дүйсенбіде"]


def _fill(template: str, rng: random.Random) -> str:
    return template.format(
        bank=rng.choice(BANKS),
        amount=rng.choice(AMOUNTS),
        percent=rng.choice(PERCENTS),
        time=rng.choice(TIMES),
        name=rng.choice(NAMES),
        day=rng.choice(DAYS),
    )


def generate(per_scheme: int, safe_count: int, seed: int = 42) -> list[dict]:
    rng = random.Random(seed)
    rows: list[dict] = []
    counter = itertools.count(1)

    for scheme in SCHEMES:
        made = 0
        attempts = 0
        seen: set[str] = set()
        while made < per_scheme and attempts < per_scheme * 20:
            attempts += 1
            lang = rng.choice(LANGS)
            template = rng.choice(SCAM[scheme][lang])
            text = _fill(template, rng)
            if text in seen:
                continue
            seen.add(text)
            made += 1
            rows.append(_row(next(counter), text, LABEL_FRAUD, scheme, lang, rng))

    made = 0
    attempts = 0
    seen = set()
    # Bounded: stop once we have safe_count unique rows OR we run out of unique
    # template/slot combinations (prevents an infinite loop when safe_count is
    # larger than the number of distinct safe transcripts we can produce).
    while made < safe_count and attempts < safe_count * 40:
        attempts += 1
        lang = rng.choice(LANGS)
        text = _fill(rng.choice(SAFE[lang]), rng)
        key = f"{lang}:{text}"
        if key in seen:
            continue
        seen.add(key)
        made += 1
        rows.append(_row(next(counter), text, LABEL_SAFE, "none", lang, rng))

    rng.shuffle(rows)
    return rows


def _row(n: int, text: str, label: str, scheme: str, lang: str, rng: random.Random) -> dict:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "id": f"syn-{n:05d}",
        "transcript": text,
        "label": label,
        "score": 90 if label == LABEL_FRAUD else 0,
        "lang": lang,
        "scheme": scheme,
        "provenance": {"origin": "synthetic", "trusted": False},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic RU/KZ scam + safe transcripts")
    parser.add_argument("--per-scheme", type=int, default=12)
    parser.add_argument("--safe", type=int, default=60)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=Path, default=Path("ml/artifacts/synthetic.jsonl"))
    args = parser.parse_args()

    rows = generate(args.per_scheme, args.safe, args.seed)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in rows), encoding="utf-8")
    fraud = sum(r["label"] == LABEL_FRAUD for r in rows)
    print(json.dumps({"rows": len(rows), "fraud": fraud, "safe": len(rows) - fraud, "out": str(args.out)}))


if __name__ == "__main__":
    main()
