import { APP_VERSION } from './modelManifest'
import { fitsDevice, whisperModels, type ModelStorageInfo } from './whisperModels'
import { qoldaVariants } from './kazakhQualityPack'

export type KnowledgeNodeType = 'app' | 'model' | 'feature' | 'dataset' | 'advice' | 'diagnostic' | 'release'
export type ModelHealthStatus = 'ready' | 'downloading' | 'available' | 'experimental' | 'downloadable' | 'blocked'
export type KnowledgeNode = {
  id: string
  type: KnowledgeNodeType
  title: string
  summary: string
  tags: string[]
  status?: 'active' | ModelHealthStatus
  version?: string
  bytes?: number
}
export type KnowledgeEdge = { from: string; to: string; relation: string }
export type KnowledgeGraph = { schemaVersion: 'voiceshield.knowledge.v3'; appVersion: string; nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }
export type KnowledgeRuntime = { installedModelIds?: readonly string[]; downloadingModelIds?: readonly string[] }

const featureCatalog: KnowledgeNode[] = [
  { id: 'feature:live-shield', type: 'feature', title: 'Live Shield', summary: 'Во время активной защиты строит локальный транскрипт доступного аудиоканала, применяет rule-score и показывает улики и безопасные действия. На Android для акустического захвата собеседника обычно нужна громкая связь.', tags: ['call', 'live', 'rules', 'privacy'], status: 'active' },
  { id: 'feature:call-review', type: 'feature', title: 'Case review', summary: 'Разбирает текущий транскрипт: риск, схему, улики, этапы атаки, timeline и checklist. Это анализ текста, а не доказательство преступления.', tags: ['review', 'evidence', 'risk'], status: 'active' },
  { id: 'feature:transcript-correction', type: 'feature', title: 'KSC2 language layer', summary: 'Определяет русский, казахский или смешанный текст и создаёт отдельный нормализованный transcript с прозрачными исправлениями. Исходный transcript не перезаписывается.', tags: ['kz', 'ru', 'asr', 'correction'], status: 'active' },
  { id: 'feature:voice-message', type: 'feature', title: 'Voice message analysis', summary: 'Открывает выбранный OGG, M4A, MP3 или WAV, получает локальную или явно выбранную облачную транскрипцию и передаёт её в review. Аудио не отправляется без отдельного выбора облачного режима.', tags: ['audio', 'asr', 'whatsapp', 'telegram'], status: 'active' },
  { id: 'feature:sms-scanner', type: 'feature', title: 'SMS Scanner', summary: 'По разрешению пользователя локально читает последние SMS и ищет связки давления, запроса кода, денег, ссылки, shortener, APK/executable download, prize/refund bait или удалённого доступа. Обычный банковский OTP сам по себе не является высоким риском.', tags: ['sms', 'smishing', 'local', 'rules'], status: 'active' },
  { id: 'feature:number-shield', type: 'feature', title: 'Number Shield', summary: 'Проверяет номер по локальной репутации, пользовательским пометкам, encrypted custom regex rules, contacts-only режиму и известным совпадениям. Номер хранится как device-bound HMAC; общая репутация не заявляется без проверенного сервиса.', tags: ['phone', 'reputation', 'family', 'rules'], status: 'active' },
  { id: 'feature:family-protection', type: 'feature', title: 'Family Protection', summary: 'Сохраняет одного доверенного человека в Android Keystore для ручного звонка или отправки предупреждения. VoiceShield никогда не связывается с ним автоматически.', tags: ['family', 'contacts', 'keystore'], status: 'active' },
  { id: 'feature:scam-tools', type: 'feature', title: 'Scam tools', summary: 'Проверяет текст, ссылку, QR или скриншот локальными правилами и OCR, затем при необходимости открывает разбор как case.', tags: ['phishing', 'qr', 'ocr'], status: 'active' },
  { id: 'feature:apk-inspection', type: 'feature', title: 'APK safety inspection', summary: 'Локально читает имя пакета, версию, APK SHA-256, signing certificate SHA-256, min/target SDK, counts activities/services/receivers и declared permissions выбранного APK. Не устанавливает, не открывает и не загружает файл. Проверка metadata не является verdict о malware.', tags: ['apk', 'sha256', 'permissions', 'local', 'metadata'], status: 'active' },
  { id: 'feature:emergency', type: 'feature', title: 'Emergency recovery', summary: 'Даёт сценарии немедленного восстановления: прекратить действие, связаться с банком по официальному каналу и сохранить доказательства. Это не замена банку или полиции.', tags: ['recovery', 'bank', 'response'], status: 'active' },
  { id: 'feature:privacy-health', type: 'feature', title: 'Privacy and device health', summary: 'Показывает готовность локальной модели, privacy setup, свободное место и battery optimization на устройстве. Экран не отправляет аудио, сообщения или номера.', tags: ['privacy', 'device', 'health'], status: 'active' },
  { id: 'feature:walkthrough', type: 'feature', title: 'Protection Walkthrough', summary: 'Показывает synthetic demo от звонка до реакции. Сценарий не является реальным звонком и не должен менять active-call intervention без явного открытия результата пользователем.', tags: ['demo', 'training', 'synthetic'], status: 'active' },
  { id: 'feature:simulator', type: 'feature', title: 'Fraud simulator', summary: 'Тренировочные сценарии помогают распознавать давление, просьбы о кодах и ложную срочность. Это обучение, а не live detection.', tags: ['training', 'simulation'], status: 'active' },
  { id: 'feature:adaptive-training', type: 'feature', title: 'Adaptive training focus', summary: 'Сохраняет только локальные ошибки тренинга и предлагает следующий сценарий по слабому навыку. Данные не уходят на сервер и не влияют на live risk.', tags: ['training', 'local', 'privacy'], status: 'active' },
  { id: 'feature:ai-assistant', type: 'feature', title: 'AI Assistant', summary: 'Подключает выбранную локальную или согласованную облачную модель для объяснения transcript, номера, SMS и recovery plan. Облачный провайдер получает только обезличенный текст после согласия.', tags: ['ai', 'local', 'cloud', 'consent'], status: 'active' },
  { id: 'feature:mcp-tools', type: 'feature', title: 'VoiceShield MCP tools', summary: 'Allow-listed read-only tools дают ассистенту знания о функциях и версиях, локальный triage transcript/SMS, redaction и статусы backend. Нет shell, доступа к контактам, отправки SMS или управления звонком.', tags: ['ai', 'mcp', 'tools', 'local', 'privacy'], status: 'active' },
  { id: 'feature:ai-case-workspace', type: 'feature', title: 'AI case workspace', summary: 'Сохраняет зашифрованную историю AI-диалогов, metadata доказательств и личные заметки. Локально извлекает текст из документов, изображений, аудио и разрешённых ZIP-файлов; облаку передаётся только подтверждённый обезличенный текст.', tags: ['ai', 'cases', 'evidence', 'attachments', 'privacy'], status: 'active' },
  { id: 'feature:model-catalog', type: 'feature', title: 'Model catalog', summary: 'Показывает локальные ASR и GGUF модели, требования к памяти, состояние загрузки и SHA-256 проверку. Модели не встраиваются скрытно и загружаются только по действию пользователя.', tags: ['models', 'download', 'storage'], status: 'active' },
  { id: 'feature:cases', type: 'feature', title: 'Cases and evidence', summary: 'Сохраняет локальные дела, labels, статусы, решения, audit trail и экспорт evidence bundle. Multi-user server workflow доступен только при настроенном backend.', tags: ['cases', 'audit', 'export'], status: 'available' },
  { id: 'feature:dataset', type: 'feature', title: 'Dataset tools', summary: 'Экспортирует redacted JSONL, CSV и split для размеченных локальных дел. Передача датасета возможна только после отдельного согласия и через системный share sheet.', tags: ['dataset', 'jsonl', 'privacy'], status: 'active' },
  { id: 'feature:improve-lab', type: 'feature', title: 'Improve VoiceShield Lab', summary: 'Opt-in механизм улучшения продукта: только размеченные пользователем кейсы превращаются в redacted quarantine JSONL. Автоматической отправки разговоров нет; raw audio, raw phone numbers, коды, ИИН, карты и длинные номера исключаются.', tags: ['dataset', 'donation', 'privacy', 'ml'], status: 'active' },
  { id: 'feature:voip', type: 'feature', title: 'VoiceShield VoIP', summary: 'Создаёт защищённую VoIP-комнату только при настроенном LiveKit-compatible backend. Обычные мобильные звонки не переводятся в VoIP автоматически.', tags: ['voip', 'livekit', 'backend'], status: 'available' },
  { id: 'feature:verify', type: 'feature', title: 'Official verification', summary: 'Направляет пользователя к независимой проверке банка, организации или номера через официальные каналы, а не по реквизитам из подозрительного сообщения.', tags: ['verify', 'bank', 'safe-action'], status: 'active' },
  { id: 'feature:ml-shadow', type: 'feature', title: 'ML shadow score', summary: 'Сравнивает экспериментальный ML-score с rules и показывает disagreement. Он не заменяет rule engine и не принимает live решения.', tags: ['ml', 'disagreement', 'safety'], status: 'experimental' },
  { id: 'feature:quality-lab', type: 'feature', title: 'Offline quality lab', summary: 'Создаёт воспроизводимые WER/CER, fraud-regression и device-benchmark отчёты из локальных данных. Это не меняет Live Shield и не доказывает качество обычного телефонного звонка без Xiaomi-теста.', tags: ['quality', 'asr', 'benchmark', 'offline'], status: 'active' },
  { id: 'feature:privacy', type: 'feature', title: 'Privacy controls', summary: 'Хранит ключи и доверенный контакт через Android Keystore, удаляет локальные данные по запросу и требует отдельного согласия на облако, SMS и donation.', tags: ['privacy', 'keystore', 'consent'], status: 'active' },
  { id: 'feature:post-call-review', type: 'feature', title: 'Post-call review', summary: 'После завершения SIM-звонка показывает локальное уведомление Review ended call, чтобы пользователь мог сохранить evidence, проверить номер и обновить правила. Оно не записывает raw audio и не отправляет звонок наружу.', tags: ['call', 'review', 'evidence', 'local'], status: 'active' },
]

const releaseCatalog: KnowledgeNode[] = [
  { id: 'release:v2.2.1', type: 'release', title: 'v2.2.1 training voice quality', summary: 'Добавляет Microsoft Edge TTS без ключа, каталог Microsoft и ElevenLabs, ветвящиеся RU/KZ-тренировки, голосовые ответы, адаптивную статистику и локальные evidence-пакеты. Live Shield audio pipeline не менялся.', tags: ['release', 'training', 'edge-tts', 'quality'], version: '2.2.1', status: 'active' },
  { id: 'release:v2.2.0', type: 'release', title: 'v2.2.0 unified assistant controls', summary: 'Добавляет MCP-инструменты с пользовательскими режимами разрешений, синхронизирует справку о функциях и версии, усиливает CI-проверки mobile и исправляет SMS Scanner UI.', tags: ['release', 'mcp', 'permissions', 'quality'], version: '2.2.0', status: 'available' },
  { id: 'release:v2.0.8', type: 'release', title: 'v2.0.8 caption-source hardening', summary: 'Исправляет ложные Live Caption transcript-события из панели уведомлений, TikTok, собственного уведомления VoiceShield и другого System UI текста. Если настоящий caption недоступен, приложение показывает degraded capture notice вместо ложного риска. Native audio pipeline не менялся.', tags: ['release', 'caption', 'accessibility', 'xiaomi'], version: '2.0.8', status: 'active' },
  { id: 'release:v2.0.7', type: 'release', title: 'v2.0.7 safety workspace', summary: 'Добавляет локальную APK-inspection, privacy/device health, emergency timer и готовые шаблоны обращения, а также адаптивный тренажёр. Live Shield и native аудиопайплайн не менялись.', tags: ['release', 'apk', 'privacy', 'training'], version: '2.0.7', status: 'active' },
  { id: 'release:v2.0.6', type: 'release', title: 'v2.0.6 quality lab patch', summary: 'Добавляет offline ASR quality lab, fraud-regression fixtures, candidate ledger для VAD/deepfake, Number Shield phone-format validation и усиленную маскировку PII для облачного AI. Live Shield и native аудиопайплайн не менялись.', tags: ['release', 'quality', 'privacy', 'benchmark'], version: '2.0.6', status: 'active' },
  { id: 'release:v2.0.5', type: 'release', title: 'v2.0.5 safe product workflow patch', summary: 'Добавляет backend diagnostics, обновление VoIP audio outputs, поиск и фильтры дел, dataset split audit и расширенную локализацию SMS. Live Shield и native аудиопайплайн не менялись.', tags: ['release', 'workflow', 'i18n', 'diagnostics'], version: '2.0.5', status: 'active' },
  { id: 'release:v2.0.4', type: 'release', title: 'v2.0.4 local backend patch', summary: 'Разрешает подключение к локальному backend по HTTP только для доверенной LAN-сети. Это не делает публичный HTTP безопасным: для внешнего сервера необходим HTTPS.', tags: ['release', 'backend', 'lan', 'security'], version: '2.0.4', status: 'active' },
  { id: 'release:v2.0.3', type: 'release', title: 'v2.0.3 patch release', summary: 'Исправляет переполнение Family contacts, обрывы облачных AI-ответов, SMS false positives, каталог функций knowledge graph и idle walkthrough UI. Нужна отдельная проверка на физическом Xiaomi.', tags: ['release', 'patch', 'fixes'], version: '2.0.3', status: 'active' },
  { id: 'release:v2.0.2', type: 'release', title: 'v2.0.2 verified baseline', summary: 'Подтверждённая пользователем Xiaomi baseline, сохранённая для отката и сравнения с patch-релизами.', tags: ['release', 'baseline', 'xiaomi'], version: '2.0.2', status: 'available' },
  { id: 'release:v2.0.0', type: 'release', title: 'v2.0.0 historical baseline', summary: 'Историческая private-beta baseline. Репозиторий не содержит полного машинно-проверенного списка различий между каждым старым релизом; ассистент обязан сообщать это вместо догадок.', tags: ['release', 'history', 'private-beta'], version: '2.0.0', status: 'available' },
]

export function buildKnowledgeGraph(storage: ModelStorageInfo | null = null, runtime: KnowledgeRuntime = {}): KnowledgeGraph {
  const modelNodes: KnowledgeNode[] = whisperModels.map((model) => ({
    id: `model:${model.id}`,
    type: 'model',
    title: model.title,
    summary: `${model.detail}. ${model.id === 'fastconformer' ? 'Специализирована для русского и казахского.' : 'Универсальная Whisper-модель.'}`,
    tags: ['asr', 'ru', 'kz', model.tier],
    status: runtime.installedModelIds?.includes(model.id) ? 'ready' : runtime.downloadingModelIds?.includes(model.id) ? 'downloading' : storage && fitsDevice(model, storage) ? 'available' : 'blocked',
    bytes: model.size,
  }))
  modelNodes.push(
    { id: 'model:qolda-q4', type: 'model', title: 'Qolda Q4_K_M', summary: 'Локальный казахско-русский semantic coprocessor.', tags: ['llm', 'kz', 'ru', 'semantic'], status: 'downloadable', bytes: qoldaVariants.balanced.size },
    { id: 'model:qolda-q5', type: 'model', title: 'Qolda Q5_K_M', summary: 'Более точный локальный разбор казахского текста.', tags: ['llm', 'kz', 'ru', 'semantic'], status: 'downloadable', bytes: qoldaVariants.maximum.size },
    { id: 'model:silero-vad', type: 'model', title: 'Silero VAD', summary: 'Кандидат ONNX для offline оценки наличия речи и качества аудио. Не bundled, не запущен и не подключён к Live Shield.', tags: ['vad', 'audio', 'onnx'], status: 'blocked', bytes: 2_327_524 },
    { id: 'model:lcnn-anti-spoof', type: 'model', title: 'LCNN anti-spoof', summary: 'Кандидат checkpoint для offline bona-fide/spoof оценки. Нужны checksum, конверсия и RU/KZ telephony evaluation до любого использования.', tags: ['deepfake', 'audio', 'asvspoof'], status: 'blocked', bytes: 3_610_050 },
  )

  const runtimeAdvice: KnowledgeNode[] = []
  if (storage && storage.availableBytes < 2 * 1024 ** 3) runtimeAdvice.push({ id: 'advice:low-storage', type: 'advice', title: 'Low storage', summary: 'Keep at least 2 GB free before downloading or updating models. Delete unused local models first.', tags: ['storage', 'model', 'device'], status: 'active' })
  if (storage && storage.ramBytes < 3 * 1024 ** 3) runtimeAdvice.push({ id: 'advice:low-ram', type: 'advice', title: 'Limited RAM', summary: 'Use the fast model and close other apps. Larger models may be slow or unavailable on this device.', tags: ['ram', 'model', 'device'], status: 'active' })
  const nodes: KnowledgeNode[] = [
    { id: 'app:voiceshield', type: 'app', title: 'KZ VoiceShield', summary: 'Локальная защита от телефонного мошенничества.', tags: ['product', 'privacy'], version: APP_VERSION, status: 'active' },
    ...releaseCatalog,
    ...featureCatalog,
    { id: 'dataset:fraud-transfer', type: 'dataset', title: 'Fraud transfer corpora', summary: 'DiFraud и multilingual fraud data; transfer-only, не RU/KZ gold labels.', tags: ['fraud', 'text', 'transfer'], status: 'experimental' },
    { id: 'dataset:asvspoof', type: 'dataset', title: 'ASVspoof2021 DF', summary: 'Bona-fide/deepfake audio labels for anti-spoof evaluation.', tags: ['deepfake', 'audio', 'benchmark'], status: 'available' },
    { id: 'dataset:kazakh-asr', type: 'dataset', title: 'Kazakh Speech Dataset', summary: 'Казахская речь и транскрипты для ASR quality evaluation.', tags: ['kz', 'asr', 'speech'], status: 'available' },
    { id: 'dataset:common-voice', type: 'dataset', title: 'Mozilla Common Voice RU/KZ', summary: 'Публичные CC0 speech corpora для offline WER/CER evaluation. Не скачиваются в APK и не являются fraud labels.', tags: ['ru', 'kz', 'asr', 'benchmark'], status: 'available' },
    { id: 'advice:phone-audio', type: 'advice', title: 'Для звонка включите громкую связь', summary: 'Android обычно не отдаёт стороннему приложению внутренний downlink call audio.', tags: ['call', 'xiaomi', 'audio'], status: 'active' },
    { id: 'advice:auto-model', type: 'advice', title: 'Автовыбор модели', summary: 'Учитывает RAM, свободное место, размер загрузки и reserve space.', tags: ['model', 'storage', 'ram'], status: 'active' },
    { id: 'advice:sms-otp', type: 'advice', title: 'Обычный OTP не равен мошенничеству', summary: 'Легитимное SMS с кодом и фразой не сообщать код никому не должно повышать риск без просьбы отправить код, ссылки, удалённого доступа или платежного действия.', tags: ['sms', 'otp', 'false-positive'], status: 'active' },
    { id: 'advice:apk-metadata', type: 'advice', title: 'APK metadata is not a malware verdict', summary: 'APK inspection flags risky permissions, old target SDK, background component volume and certificate hashes. It helps decide whether to install, but does not prove malware or safety.', tags: ['apk', 'metadata', 'limitations'], status: 'active' },
    { id: 'diagnostic:real-xiaomi', type: 'diagnostic', title: 'Реальный Xiaomi call test', summary: 'Нужен физический телефон: эмулятор не проверяет Telecom audio route.', tags: ['qa', 'xiaomi', 'call'], status: 'blocked' },
    ...runtimeAdvice,
    ...modelNodes,
  ]

  const edges: KnowledgeEdge[] = ([
    ...featureCatalog.map((feature) => ['app:voiceshield', feature.id, 'provides'] as [string, string, string]),
    ['app:voiceshield', 'release:v2.2.1', 'current release'], ['release:v2.2.1', 'release:v2.2.0', 'succeeds'],
    ['release:v2.0.8', 'release:v2.0.7', 'succeeds'], ['release:v2.0.7', 'release:v2.0.6', 'succeeds'], ['release:v2.0.6', 'release:v2.0.5', 'succeeds'], ['release:v2.0.5', 'release:v2.0.4', 'succeeds'], ['release:v2.0.4', 'release:v2.0.3', 'succeeds'], ['release:v2.0.3', 'release:v2.0.2', 'succeeds'], ['release:v2.0.2', 'release:v2.0.0', 'succeeds'],
    ['feature:live-shield', 'feature:transcript-correction', 'feeds'], ['feature:live-shield', 'feature:ml-shadow', 'compares'], ['feature:post-call-review', 'feature:cases', 'can create'],
    ['feature:live-shield', 'model:fastconformer', 'uses'], ['feature:transcript-correction', 'model:qolda-q4', 'can use'],
    ['feature:quality-lab', 'dataset:kazakh-asr', 'evaluates against'], ['feature:quality-lab', 'dataset:common-voice', 'evaluates against'], ['feature:quality-lab', 'model:silero-vad', 'candidate evaluation'], ['feature:quality-lab', 'model:lcnn-anti-spoof', 'candidate evaluation'], ['feature:ml-shadow', 'dataset:fraud-transfer', 'trained with'], ['model:lcnn-anti-spoof', 'dataset:asvspoof', 'trained/evaluated on'],
    ['feature:cases', 'feature:ml-shadow', 'reviews'], ['feature:live-shield', 'advice:phone-audio', 'requires'], ['app:voiceshield', 'advice:auto-model', 'uses'],
    ['feature:ai-assistant', 'feature:ai-case-workspace', 'organizes'], ['feature:ai-case-workspace', 'feature:cases', 'exports evidence to'],
    ['feature:ai-assistant', 'feature:mcp-tools', 'uses read-only context'], ['feature:mcp-tools', 'feature:privacy', 'enforces'], ['feature:mcp-tools', 'feature:sms-scanner', 'can pre-check'], ['feature:mcp-tools', 'feature:number-shield', 'can explain'],
    ['feature:improve-lab', 'feature:dataset', 'extends'], ['feature:improve-lab', 'feature:privacy', 'requires'], ['feature:improve-lab', 'feature:ml-shadow', 'feeds after review'],
    ['feature:sms-scanner', 'advice:sms-otp', 'reduces false positives'], ['feature:apk-inspection', 'advice:apk-metadata', 'requires limitation'],
    ['diagnostic:real-xiaomi', 'feature:live-shield', 'validates'],
  ] as Array<[string, string, string]>).map(([from, to, relation]) => ({ from, to, relation }))

  return { schemaVersion: 'voiceshield.knowledge.v3', appVersion: APP_VERSION, nodes, edges }
}

export function adviceForModelError(error: string, graph: KnowledgeGraph): KnowledgeNode | undefined {
  const message = error.toLocaleLowerCase()
  const preferredId = /storage|space|disk/.test(message) ? 'advice:low-storage' : /ram|memory|out of memory/.test(message) ? 'advice:low-ram' : ''
  if (preferredId) return graph.nodes.find((node) => node.id === preferredId)
  return graph.nodes.find((node) => node.type === 'advice' && /network|download|http/.test(message) && node.tags.includes('model'))
}

export function searchKnowledge(graph: KnowledgeGraph, query: string): KnowledgeNode[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return graph.nodes
  return graph.nodes.filter((node) => [node.title, node.summary, ...node.tags].join(' ').toLocaleLowerCase().includes(needle))
}

export function relatedKnowledge(graph: KnowledgeGraph, nodeId: string): KnowledgeNode[] {
  const ids = graph.edges.flatMap((edge) => edge.from === nodeId ? [edge.to] : edge.to === nodeId ? [edge.from] : [])
  return graph.nodes.filter((node) => ids.includes(node.id))
}

export function buildAssistantKnowledgeContext(graph: KnowledgeGraph, maxNodes = 32): string {
  const prioritized = [...graph.nodes].sort((left, right) => {
    const rank = (node: KnowledgeNode) => node.type === 'app' ? 0 : node.type === 'release' ? 1 : node.type === 'feature' ? 2 : node.type === 'advice' ? 3 : 4
    return rank(left) - rank(right)
  }).slice(0, maxNodes)
  return [
    `VoiceShield application knowledge. Version: ${graph.appVersion}. Graph schema: ${graph.schemaVersion}.`,
    ...prioritized.map((node) => `${node.title} [${node.status ?? 'active'}]: ${node.summary}`),
    'Treat this as product context. Do not claim an external, experimental, blocked, or device-unverified capability is available.',
  ].join('\n')
}
