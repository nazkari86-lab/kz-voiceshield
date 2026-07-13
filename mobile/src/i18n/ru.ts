export type I18nKeys = {
  app: { name: string; tagline: string }
  nav: { live: string; scan: string; learn: string; cases: string; more: string }
  live: {
    active: string; standby: string; start: string; stop: string
    saveCase: string; shareReport: string; transcript: string
    waitAudio: string; hearsAudio: string; pauseTitle: string
    pauseCopy: string; startPause: string; restartPause: string
  }
  risk: { critical: string; high: string; medium: string; low: string }
  setup: {
    title: string; theme: string; themeAuto: string; themeLight: string; themeDark: string
    language: string; download: string; deleteAll: string; confirmDelete: string; cancel: string
  }
  llm: { title: string; notLoaded: string; loadModel: string }
  sms: { title: string; scan: string }
  history: { title: string; clear: string; empty: string }
  stats: { title: string }
}

export const ru: I18nKeys = {
  app: { name: 'KZ VoiceShield', tagline: 'Защита от мошенничества' },
  nav: { live: 'Защита', scan: 'Скан', learn: 'Обучение', cases: 'Дела', more: 'Ещё' },
  live: {
    active: 'ЗАЩИТА АКТИВНА',
    standby: 'РЕЖИМ ОЖИДАНИЯ',
    start: 'Включить защиту',
    stop: 'Остановить',
    saveCase: 'Сохранить дело',
    shareReport: 'Отчёт',
    transcript: 'ТРАНСКРИПТ В РЕАЛЬНОМ ВРЕМЕНИ',
    waitAudio: 'ОЖИДАНИЕ ЗВУКА',
    hearsAudio: 'МИКРОФОН СЛЫШИТ ЗВУК',
    pauseTitle: 'Возьмите паузу 30 секунд',
    pauseCopy: 'Завершите звонок. Не сообщайте коды и не подтверждайте платежи.',
    startPause: 'Начать паузу',
    restartPause: 'Перезапустить паузу',
  },
  risk: { critical: 'Критический', high: 'Высокий', medium: 'Средний', low: 'Низкий' },
  setup: {
    title: 'Настройка',
    theme: 'Тема оформления',
    themeAuto: 'Авто', themeLight: 'Светлая', themeDark: 'Тёмная',
    language: 'Язык',
    download: 'Скачать модель',
    deleteAll: 'Удалить все данные',
    confirmDelete: 'Подтвердить удаление',
    cancel: 'Отмена',
  },
  llm: { title: 'VoiceShield AI', notLoaded: 'Нейросеть не загружена', loadModel: 'Загрузить модель' },
  sms: { title: 'SMS-сканер', scan: 'Сканировать' },
  history: { title: 'История звонков', clear: 'Очистить', empty: 'Нет сохранённых звонков' },
  stats: { title: 'Статистика' },
}
