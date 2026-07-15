import React, { Children, type ReactNode } from 'react'
import { Text as NativeText, type TextProps } from 'react-native'
import { useI18n } from '../I18nContext'

const translations: Record<string, { ru: string; kz: string }> = {
  'Save current': { ru: 'Сохранить текущий', kz: 'Ағымдағыны сақтау' },
  'No saved cases yet': { ru: 'Сохранённых дел пока нет', kz: 'Сақталған істер әзірге жоқ' },
  'Save reviewed calls to build a local investigation library.': { ru: 'Сохраняйте проверенные звонки, чтобы создать локальную библиотеку расследований.', kz: 'Жергілікті тергеу қорын құру үшін тексерілген қоңырауларды сақтаңыз.' },
  'Reviewer trusted': { ru: 'Проверено рецензентом', kz: 'Рецензент растаған' },
  'Not training-eligible': { ru: 'Не подходит для обучения', kz: 'Оқытуға жарамсыз' },
  Bank: { ru: 'Банк', kz: 'Банк' },
  Callback: { ru: 'Перезвонить', kz: 'Қайта қоңырау' },
  Evidence: { ru: 'Доказательства', kz: 'Дәлелдер' },
  'Share bundle': { ru: 'Поделиться пакетом', kz: 'Пакетпен бөлісу' },
  'Confirm delete': { ru: 'Подтвердить удаление', kz: 'Жоюды растау' },
  Cancel: { ru: 'Отмена', kz: 'Бас тарту' },
  Delete: { ru: 'Удалить', kz: 'Жою' },
  'Improve protection (opt-in)': { ru: 'Улучшить защиту (по желанию)', kz: 'Қорғанысты жақсарту (қалауыңыз бойынша)' },
  'Donation consent on': { ru: 'Согласие на передачу включено', kz: 'Дерек беруге келісім қосулы' },
  'Enable donation': { ru: 'Разрешить передачу', kz: 'Дерек беруге рұқсат ету' },
  Export: { ru: 'Экспорт', kz: 'Экспорт' },
  'Share JSONL': { ru: 'Поделиться JSONL', kz: 'JSONL бөлісу' },
  'Share CSV': { ru: 'Поделиться CSV', kz: 'CSV бөлісу' },
  'Share split': { ru: 'Поделиться разбиением', kz: 'Бөлу жиынтығымен бөлісу' },
  'Confirm clear': { ru: 'Подтвердить очистку', kz: 'Тазалауды растау' },
  Clear: { ru: 'Очистить', kz: 'Тазалау' },
  'Stage coverage': { ru: 'Покрытие этапов', kz: 'Кезеңдер қамтылуы' },
  'No stage coverage yet.': { ru: 'Данных о покрытии этапов пока нет.', kz: 'Кезеңдер қамтылуы туралы дерек әзірге жоқ.' },
  'RECOVERY MODE': { ru: 'РЕЖИМ ВОССТАНОВЛЕНИЯ', kz: 'ҚАЛПЫНА КЕЛТІРУ РЕЖИМІ' },
  'Secure your accounts now': { ru: 'Защитите свои аккаунты сейчас', kz: 'Аккаунттарыңызды қазір қорғаңыз' },
  'End the call first. Select what was exposed, then complete the official recovery steps in order.': { ru: 'Сначала завершите звонок. Выберите, что раскрыто, затем выполните официальные шаги восстановления по порядку.', kz: 'Алдымен қоңырауды аяқтаңыз. Не ашылғанын таңдап, ресми қалпына келтіру қадамдарын ретімен орындаңыз.' },
  'CHOOSE EXPOSURE': { ru: 'ВЫБЕРИТЕ РАСКРЫТЫЕ ДАННЫЕ', kz: 'АШЫЛҒАН ДЕРЕКТЕРДІ ТАҢДАҢЫЗ' },
  'What did you share?': { ru: 'Что вы сообщили?', kz: 'Нені хабарладыңыз?' },
  'Open immediate recovery checklist': { ru: 'Открыть срочный чек-лист восстановления', kz: 'Шұғыл қалпына келтіру тізімін ашу' },
  'ACTIVE RECOVERY PLAN': { ru: 'АКТИВНЫЙ ПЛАН ВОССТАНОВЛЕНИЯ', kz: 'БЕЛСЕНДІ ҚАЛПЫНА КЕЛТІРУ ЖОСПАРЫ' },
  Change: { ru: 'Изменить', kz: 'Өзгерту' },
  'CHECKLIST PROGRESS': { ru: 'ПРОГРЕСС ЧЕК-ЛИСТА', kz: 'ЧЕК-ЛИСТ ПРОГРЕСІ' },
  'Open official contacts': { ru: 'Открыть официальные контакты', kz: 'Ресми байланыстарды ашу' },
  'Local reputation is ready': { ru: 'Локальная репутация готова', kz: 'Жергілікті бедел дайын' },
  'Number Shield': { ru: 'Защита номера', kz: 'Нөмір қорғанысы' },
  Check: { ru: 'Проверить', kz: 'Тексеру' },
  Trust: { ru: 'Доверять', kz: 'Сену' },
  Block: { ru: 'Заблокировать', kz: 'Бұғаттау' },
  'Report spam': { ru: 'Пожаловаться на спам', kz: 'Спам туралы хабарлау' },
  'CRITICAL': { ru: 'КРИТИЧЕСКИЙ РИСК', kz: 'КРИТИКАЛЫҚ ҚАУІП' },
  'HIGH RISK': { ru: 'ВЫСОКИЙ РИСК', kz: 'ЖОҒАРЫ ҚАУІП' },
  CAUTION: { ru: 'ОСТОРОЖНО', kz: 'АБАЙ БОЛЫҢЫЗ' },
  'Private number profile': { ru: 'Личный профиль номера', kz: 'Нөмірдің жеке профилі' },
  'Save profile': { ru: 'Сохранить профиль', kz: 'Профильді сақтау' },
  'Clear profile': { ru: 'Очистить профиль', kz: 'Профильді тазалау' },
  'Automatic call rules': { ru: 'Автоматические правила звонков', kz: 'Қоңыраулардың автоматты ережелері' },
  'Rules backup': { ru: 'Резервная копия правил', kz: 'Ережелердің сақтық көшірмесі' },
  'Verify through an official channel': { ru: 'Проверьте через официальный канал', kz: 'Ресми арна арқылы тексеріңіз' },
  'Call official number': { ru: 'Позвонить по официальному номеру', kz: 'Ресми нөмірге қоңырау шалу' },
  'Open official site': { ru: 'Открыть официальный сайт', kz: 'Ресми сайтты ашу' },
  'Checked': { ru: 'Проверено', kz: 'Тексерілген' },
  'Operations': { ru: 'Операции', kz: 'Операциялар' },
  'Escalation queue': { ru: 'Очередь эскалации', kz: 'Эскалация кезегі' },
  'Bank contact needed': { ru: 'Нужен контакт с банком', kz: 'Банкпен байланысу қажет' },
  'No cases': { ru: 'Нет дел', kz: 'Істер жоқ' },
  'Scan messages': { ru: 'Проверить сообщения', kz: 'Хабарламаларды тексеру' },
  'SMS Scanner': { ru: 'Проверка SMS', kz: 'SMS тексеру' },
  'No suspicious messages found': { ru: 'Подозрительных сообщений не найдено', kz: 'Күдікті хабарламалар табылмады' },
  'Protection walkthrough': { ru: 'Пошаговая защита', kz: 'Қорғаныс нұсқаулығы' },
  'Case review': { ru: 'Проверка дела', kz: 'Істі тексеру' },
  'Evidence & signals': { ru: 'Доказательства и сигналы', kz: 'Дәлелдер мен сигналдар' },
  'Incident timeline': { ru: 'Хронология инцидента', kz: 'Оқиға хронологиясы' },
  'Threat library': { ru: 'Библиотека угроз', kz: 'Қауіптер кітапханасы' },
  'Attack sequence': { ru: 'Цепочка атаки', kz: 'Шабуыл тізбегі' },
  Emergency: { ru: 'Экстренная помощь', kz: 'Шұғыл көмек' },
  'Voice messages': { ru: 'Голосовые сообщения', kz: 'Дауыстық хабарламалар' },
  'Training dataset': { ru: 'Датасет обучения', kz: 'Оқыту деректер жиыны' },
  Playbook: { ru: 'Сценарии действий', kz: 'Әрекет сценарийлері' },
  Family: { ru: 'Семья', kz: 'Отбасы' },
  Verify: { ru: 'Проверка', kz: 'Тексеру' },
  'Number shield': { ru: 'Защита номера', kz: 'Нөмір қорғанысы' },
  'Scam tools': { ru: 'Инструменты проверки', kz: 'Алаяқтықты тексеру құралдары' },
  'Voice message': { ru: 'Голосовое сообщение', kz: 'Дауыстық хабарлама' },
  'Data & model': { ru: 'Данные и модель', kz: 'Деректер мен модель' },
  Statistics: { ru: 'Статистика', kz: 'Статистика' },
  'SMS scanner': { ru: 'Проверка SMS', kz: 'SMS тексеру' },
  'Call history': { ru: 'История звонков', kz: 'Қоңырау тарихы' },
  'AI assistant': { ru: 'AI-ассистент', kz: 'AI-көмекші' },
  Setup: { ru: 'Настройка', kz: 'Баптаулар' },
  Learn: { ru: 'Обучение', kz: 'Оқу' },
  Investigate: { ru: 'Анализ', kz: 'Талдау' },
  Recover: { ru: 'Восстановление', kz: 'Қалпына келтіру' },
  Workspace: { ru: 'Рабочая область', kz: 'Жұмыс кеңістігі' },
  Protect: { ru: 'Защита', kz: 'Қорғаныс' },
  'Everything else, clearly organized.': { ru: 'Все инструменты организованы понятно.', kz: 'Барлық құралдар түсінікті реттелген.' },
  'Choose a tool for investigation, recovery, reviewers or device setup.': { ru: 'Выберите инструмент для анализа, восстановления, работы рецензента или настройки устройства.', kz: 'Талдау, қалпына келтіру, рецензент жұмысы немесе құрылғы баптауы үшін құралды таңдаңыз.' },
  OPEN: { ru: 'ОТКРЫТЬ', kz: 'АШУ' },
  'LOCAL MODEL HUB': { ru: 'ЛОКАЛЬНЫЕ МОДЕЛИ', kz: 'ЖЕРГІЛІКТІ МОДЕЛЬДЕР' },
  'OFFICIAL API HUB': { ru: 'ОФИЦИАЛЬНЫЕ API', kz: 'РЕСМИ API' },
  'KAZAKH QUALITY PACK': { ru: 'ПАКЕТ КАЗАХСКОГО КАЧЕСТВА', kz: 'ҚАЗАҚ ТІЛІ САПА ПАКЕТІ' },
  'Active detector': { ru: 'Активный детектор', kz: 'Белсенді детектор' },
  'Recent Kazakhstan operation coverage': { ru: 'Покрытие последних операций в Казахстане', kz: 'Қазақстандағы соңғы операцияларды қамту' },
  'Kazakh quality pack status': { ru: 'Статус пакета казахского качества', kz: 'Қазақ тілі сапа пакетінің күйі' },
  'Experimental ML model': { ru: 'Экспериментальная ML-модель', kz: 'Эксперименттік ML-модель' },
  'Training corpus': { ru: 'Обучающая выборка', kz: 'Оқыту корпусы' },
  'Baseline evaluation': { ru: 'Проверка baseline-модели', kz: 'Baseline моделін бағалау' },
  'Data sources': { ru: 'Источники данных', kz: 'Дереккөздер' },
  'How this model is built': { ru: 'Как построена модель', kz: 'Бұл модель қалай жасалған' },
  Privacy: { ru: 'Конфиденциальность', kz: 'Құпиялылық' },
  'free': { ru: 'бесплатно', kz: 'тегін' },
  'paid': { ru: 'платно', kz: 'ақылы' },
  'Connect API key': { ru: 'Подключить API-ключ', kz: 'API-кілтті қосу' },
  'Disconnect': { ru: 'Отключить', kz: 'Ажырату' },
  'Search models': { ru: 'Поиск моделей', kz: 'Модельдерді іздеу' },
  'Download': { ru: 'Скачать', kz: 'Жүктеу' },
  'Import': { ru: 'Импортировать', kz: 'Импорттау' },
  'Delete model': { ru: 'Удалить модель', kz: 'Модельді жою' },
  'Run': { ru: 'Запустить', kz: 'Іске қосу' },
}

function translateUi(value: string, lang: 'ru' | 'kz'): string {
  const exact = translations[value]
  if (exact) return exact[lang]
  const lowerValue = value.toLowerCase()
  const caseInsensitiveKey = Object.keys(translations).find((key) => key.toLowerCase() === lowerValue)
  if (caseInsensitiveKey) {
    const candidate = translations[caseInsensitiveKey]
    if (candidate) {
      const translated = candidate[lang]
      return value === value.toUpperCase() ? translated.toUpperCase() : translated
    }
  }
  const saved = value.match(/^(\d+) saved cases$/)
  if (saved) return lang === 'ru' ? `${saved[1]} сохранённых дел` : `${saved[1]} сақталған іс`
  const donated = value.match(/^Donate (\d+) reviewed \(redacted\)$/)
  if (donated) return lang === 'ru' ? `Передать: ${donated[1]} проверенных (обезличено)` : `${donated[1]} тексерілгенді жіберу (жасырылған)`
  const call = value.match(/^Call (.+)$/)
  if (call) return lang === 'ru' ? `Позвонить: ${call[1]}` : `Қоңырау шалу: ${call[1]}`
  const step = value.match(/^STEP (\d+)$/)
  if (step) return lang === 'ru' ? `ШАГ ${step[1]}` : `${step[1]}-ҚАДАМ`
  return value
}

export function LocalizedText({ children, ...props }: TextProps & { children?: ReactNode }) {
  const { lang } = useI18n()
  return <NativeText {...props}>{Children.map(children, (child) => typeof child === 'string' ? translateUi(child, lang) : child)}</NativeText>
}
