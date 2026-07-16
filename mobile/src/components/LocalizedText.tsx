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
}

function translateUi(value: string, lang: 'ru' | 'kz' | 'en'): string {
  if (lang === 'en') return value
  const exact = translations[value]
  if (exact) return exact[lang]
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
