export type I18nKeys = {
  app: { name: string; tagline: string }
  nav: { live: string; scan: string; learn: string; cases: string; more: string }
  live: {
    active: string; standby: string; start: string; stop: string
    saveCase: string; shareReport: string; transcript: string
    waitAudio: string; hearsAudio: string; pauseTitle: string
    pauseCopy: string; startPause: string; restartPause: string
    signals: string; correction: string; rawDisagreement: string
    noCaption: string; microphoneFallback: string; endCall: string
    sharedData: string; recoveryPlan: string; practice: string; scamPatterns: string
    doThisNow: string; liveTranscript: string; microphoneState: string
    waitingSpeaker: string; transcriptPlaceholder: string; save: string
    endCallTitle: string; endCallCopy: string
  }
  risk: { critical: string; high: string; medium: string; low: string }
  setup: {
    title: string; theme: string; themeAuto: string; themeLight: string; themeDark: string
    language: string; download: string; deleteAll: string; confirmDelete: string; cancel: string
    privacyTitle: string; privacyAccepted: string; privacyCopy: string; agree: string; notNow: string
    requiredAccess: string; accessibility: string; captionSettings: string; riskOverlay: string
    callScreening: string; microphone: string; notification: string; otpDetection: string
    battery: string; xiaomiAutostart: string; open: string; optionalIntegration: string
    optionalCopy: string; defaultPhone: string; defaultPhoneApps: string; speechModel: string
    speechCopy: string; recommended: string; checkingStorage: string; automatic: string
    automaticCopy: string; readyForDevice: string; unavailable: string; localData: string
    encryptedCases: string; openAppSettings: string; aiAssistant: string; aiCopy: string
    modelDownload: string; downloading: string; ready: string; setupStatus: string
  }
  llm: { title: string; notLoaded: string; loadModel: string }
  sms: { title: string; scan: string }
  history: { title: string; clear: string; empty: string }
  stats: { title: string }
  onboarding: { welcome: string; welcomeTitle: string; welcomeBody: string; how: string; howTitle: string; howBody: string; important: string; importantTitle: string; importantBody: string; privacy: string; privacyTitle: string; privacyBody: string; next: string; skip: string; getStarted: string }
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
    signals: 'сигналов', correction: 'Применена коррекция AI', rawDisagreement: 'Разница исходного и исправленного: {from} → {to}',
    noCaption: 'Нет текста в субтитрах?', microphoneFallback: 'Использовать микрофон и громкую связь', endCall: 'Завершить звонок',
    sharedData: 'Я сообщил данные', recoveryPlan: 'План срочного восстановления', practice: 'Практика', scamPatterns: 'Изучить шаблоны мошенников',
    doThisNow: 'Сделайте это сейчас', liveTranscript: 'ТРАНСКРИПТ В РЕАЛЬНОМ ВРЕМЕНИ', microphoneState: 'МИКРОФОН СЛЫШИТ ЗВУК', waitingSpeaker: 'ОЖИДАНИЕ ЗВУКА',
    transcriptPlaceholder: 'Текст появится здесь. Можно также вставить разговор.', save: 'Сохранить', endCallTitle: 'Завершить текущий звонок?', endCallCopy: 'Текущий звонок будет отключён. Завершайте его только когда готовы остановить разговор.',
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
    privacyTitle: 'Требуется согласие перед запуском защиты', privacyAccepted: 'Согласие на локальную защиту принято',
    privacyCopy: 'VoiceShield обрабатывает субтитры звонка, звук микрофона, активные приложения и типы уведомлений только во время активной сессии. Тексты уведомлений, коды и исходные номера не сохраняются. Сохранённые дела обезличиваются и шифруются на устройстве. Локальный режим не отправляет аудио или транскрипты.',
    agree: 'Согласен', notNow: 'Не сейчас', requiredAccess: 'Необходимые разрешения', accessibility: 'Служба субтитров Android', captionSettings: 'Настройки субтитров Android', riskOverlay: 'Оверлей риска', callScreening: 'Роль проверки звонков', microphone: 'Резервный микрофон', notification: 'Уведомления защиты', otpDetection: 'Доступ к уведомлениям для OTP', battery: 'Исключение оптимизации батареи', xiaomiAutostart: 'Автозапуск Xiaomi/HyperOS', open: 'Открыть', optionalIntegration: 'Дополнительная интеграция с телефоном',
    optionalCopy: 'В качестве приложения телефона VoiceShield может показывать собственный экран входящего и активного SIM-звонка с риском номера и семейными метками. Для звонящего приложение не требуется. Android не предоставляет стороннему приложению исходный звук собеседника, поэтому транскрипция использует субтитры или микрофон.', defaultPhone: 'Использовать VoiceShield как приложение телефона', defaultPhoneApps: 'Приложения телефона по умолчанию', speechModel: 'Локальная модель речи', speechCopy: 'Распознавание выполняется на устройстве. Рекомендация учитывает свободное место, временное место для загрузки и RAM. Загрузка возобновляется после обрыва сети, а модель проверяется по размеру и SHA-256.', recommended: 'Рекомендуется', checkingStorage: 'проверка памяти…', automatic: 'Автоматическая рекомендация', automaticCopy: 'Использует лучшую совместимую модель: {model}', readyForDevice: 'Подходит этому устройству · требуется {gb} ГБ во время загрузки', unavailable: 'Недоступно · требуется {gb} ГБ и {ram} ГБ RAM', localData: 'Локальные данные', encryptedCases: '{count} зашифрованных дел.', openAppSettings: 'Открыть настройки приложения Android', aiAssistant: 'AI-ассистент', aiCopy: 'Локальная модель для анализа транскриптов. Скачивается один раз.', modelDownload: 'Скачать модель', downloading: 'Загрузка: {progress}%',
    ready: 'Готово', setupStatus: 'Настроить',
  },
  llm: { title: 'VoiceShield AI', notLoaded: 'Нейросеть не загружена', loadModel: 'Загрузить модель' },
  sms: { title: 'SMS-сканер', scan: 'Сканировать' },
  history: { title: 'История звонков', clear: 'Очистить', empty: 'Нет сохранённых звонков' },
  stats: { title: 'Статистика' },
  onboarding: { welcome: 'ДОБРО ПОЖАЛОВАТЬ', welcomeTitle: 'Ваш AI-щит\nот телефонных мошенников', welcomeBody: 'KZ VoiceShield обнаруживает мошенничество в реальном времени. Распознавание речи и правила работают на устройстве.', how: 'КАК ЭТО РАБОТАЕТ', howTitle: 'Говорите, слушайте\nполучайте предупреждения', howBody: 'Во время подозрительного звонка включите защиту. Микрофон переводит разговор в текст, а движок риска анализирует каждую фразу.', important: 'ВАЖНО', importantTitle: 'Включите громкую связь\nдля обеих сторон', importantBody: 'Android не разрешает приложениям читать внутренний звук звонка. Включите громкую связь, чтобы микрофон услышал собеседника.', privacy: 'КОНФИДЕНЦИАЛЬНОСТЬ', privacyTitle: 'Локально по умолчанию,\nоблако только с согласия', privacyBody: 'Транскрипты шифруются на устройстве. Облачные модели получают только обезличенный текст после отдельного согласия.', next: 'Далее', skip: 'Пропустить', getStarted: 'Начать' },
}
