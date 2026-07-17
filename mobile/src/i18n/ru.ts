export type I18nKeys = {
  app: { name: string; tagline: string }
  nav: { live: string; scan: string; learn: string; cases: string; more: string }
  live: {
    active: string; standby: string; start: string; stop: string
    saveCase: string; shareReport: string; transcript: string
    waitAudio: string; hearsAudio: string; pauseTitle: string
    pauseCopy: string; startPause: string; restartPause: string
    endCall: string; noCaptionTitle: string; noCaptionCopy: string
    sharedData: string; recoveryPlan: string; practice: string
    practiceDesc: string; doNow: string; pauseActive: string
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
  voip: {
    eyebrow: string; title: string; description: string; ready: string; readyCopy: string
    create: string; creating: string; callId: string; callIdPlaceholder: string; join: string
    joining: string; connected: string; connecting: string; participants: string; waiting: string
    participantConnected: string; microphoneOn: string; microphoneOff: string; audioOutput: string; refreshAudio: string; audioUnavailable: string
    shareCallId: string; ending: string; end: string; analysisBoundary: string
    errorNetwork: string; errorAuthorization: string; errorUnavailable: string; errorNotFound: string
    errorFallback: string; errorAudioOutput: string; errorAudioDevices: string; errorMicrophone: string
  }
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
    endCall: 'Завершить звонок',
    noCaptionTitle: 'Нет текста субтитров?',
    noCaptionCopy: 'Включите громкую связь и используйте микрофон',
    sharedData: 'Я передал данные',
    recoveryPlan: 'Немедленный план действий',
    practice: 'Тренировка',
    practiceDesc: 'Изучите схемы мошенничества',
    doNow: 'Сделайте это сейчас',
    pauseActive: 'Пауза активна:',
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
  voip: {
    eyebrow: 'ЗАЩИЩЁННАЯ СВЯЗЬ',
    title: 'Защищённый VoIP-звонок',
    description: 'Прямой аудиозвонок внутри VoiceShield через временную комнату LiveKit. Секреты сервера остаются на Mac или вашем backend.',
    ready: 'Готово к защищённому звонку',
    readyCopy: 'Создайте временную комнату и передайте Call ID собеседнику. Для подключения обоим участникам нужен настроенный сервер VoiceShield.',
    create: 'Создать звонок', creating: 'Создаём комнату…', callId: 'Call ID', callIdPlaceholder: 'Введите Call ID для подключения', join: 'Подключиться к звонку',
    joining: 'Подключаемся…', connected: 'Звонок подключён', connecting: 'Подключение к защищённой комнате…', participants: 'Участников в звонке', waiting: 'Ожидание собеседника. Передайте ему Call ID.',
    participantConnected: 'Собеседник подключён. Аудио передаётся напрямую через LiveKit.', microphoneOn: 'Микрофон включён', microphoneOff: 'Микрофон выключен', audioOutput: 'Вывод звука', refreshAudio: 'Обновить аудиоустройства', audioUnavailable: 'Аудиоустройства ещё не готовы. Обновите список после подключения к комнате.',
    shareCallId: 'Передать Call ID', ending: 'Завершаем звонок…', end: 'Завершить звонок', analysisBoundary: 'Live Shield работает отдельно и не создаёт фиктивную расшифровку звонка.',
    errorNetwork: 'Нет связи с сервером. Проверьте URL, сеть Wi-Fi и работу backend.', errorAuthorization: 'Сервер отклонил доступ. Проверьте API-токен в настройках.', errorUnavailable: 'Голосовой сервис недоступен: LiveKit не настроен на сервере.', errorNotFound: 'Комната не найдена или уже завершена.',
    errorFallback: 'Не удалось подключиться к защищённому звонку.', errorAudioOutput: 'Не удалось переключить вывод звука.', errorAudioDevices: 'Не удалось получить доступные аудиоустройства.', errorMicrophone: 'Микрофон недоступен',
  },
}
