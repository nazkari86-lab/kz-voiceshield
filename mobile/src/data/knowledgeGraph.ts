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
  { id: 'feature:sms-scanner', type: 'feature', title: 'SMS Scanner', summary: 'По разрешению пользователя локально читает последние SMS и ищет связки давления, запроса кода, денег, ссылки или удалённого доступа. Обычный банковский OTP сам по себе не является высоким риском.', tags: ['sms', 'smishing', 'local'], status: 'active' },
  { id: 'feature:number-shield', type: 'feature', title: 'Number Shield', summary: 'Проверяет номер по локальной репутации, пользовательским пометкам и известным совпадениям. Номер хранится как device-bound HMAC; общая репутация не заявляется без проверенного сервиса.', tags: ['phone', 'reputation', 'family'], status: 'active' },
  { id: 'feature:family-protection', type: 'feature', title: 'Family Protection', summary: 'Сохраняет одного доверенного человека в Android Keystore для ручного звонка или отправки предупреждения. VoiceShield никогда не связывается с ним автоматически.', tags: ['family', 'contacts', 'keystore'], status: 'active' },
  { id: 'feature:scam-tools', type: 'feature', title: 'Scam tools', summary: 'Проверяет текст, ссылку, QR или скриншот локальными правилами и OCR, затем при необходимости открывает разбор как case.', tags: ['phishing', 'qr', 'ocr'], status: 'active' },
  { id: 'feature:emergency', type: 'feature', title: 'Emergency recovery', summary: 'Даёт сценарии немедленного восстановления: прекратить действие, связаться с банком по официальному каналу и сохранить доказательства. Это не замена банку или полиции.', tags: ['recovery', 'bank', 'response'], status: 'active' },
  { id: 'feature:walkthrough', type: 'feature', title: 'Protection Walkthrough', summary: 'Показывает synthetic demo от звонка до реакции. Сценарий не является реальным звонком и не должен менять active-call intervention без явного открытия результата пользователем.', tags: ['demo', 'training', 'synthetic'], status: 'active' },
  { id: 'feature:simulator', type: 'feature', title: 'Fraud simulator', summary: 'Тренировочные сценарии помогают распознавать давление, просьбы о кодах и ложную срочность. Это обучение, а не live detection.', tags: ['training', 'simulation'], status: 'active' },
  { id: 'feature:ai-assistant', type: 'feature', title: 'AI Assistant', summary: 'Подключает выбранную локальную или согласованную облачную модель для объяснения transcript, номера, SMS и recovery plan. Облачный провайдер получает только обезличенный текст после согласия.', tags: ['ai', 'local', 'cloud', 'consent'], status: 'active' },
  { id: 'feature:model-catalog', type: 'feature', title: 'Model catalog', summary: 'Показывает локальные ASR и GGUF модели, требования к памяти, состояние загрузки и SHA-256 проверку. Модели не встраиваются скрытно и загружаются только по действию пользователя.', tags: ['models', 'download', 'storage'], status: 'active' },
  { id: 'feature:cases', type: 'feature', title: 'Cases and evidence', summary: 'Сохраняет локальные дела, labels, статусы, решения, audit trail и экспорт evidence bundle. Multi-user server workflow доступен только при настроенном backend.', tags: ['cases', 'audit', 'export'], status: 'available' },
  { id: 'feature:dataset', type: 'feature', title: 'Dataset tools', summary: 'Экспортирует redacted JSONL, CSV и split для размеченных локальных дел. Передача датасета возможна только после отдельного согласия и через системный share sheet.', tags: ['dataset', 'jsonl', 'privacy'], status: 'active' },
  { id: 'feature:voip', type: 'feature', title: 'VoiceShield VoIP', summary: 'Создаёт защищённую VoIP-комнату только при настроенном LiveKit-compatible backend. Обычные мобильные звонки не переводятся в VoIP автоматически.', tags: ['voip', 'livekit', 'backend'], status: 'available' },
  { id: 'feature:verify', type: 'feature', title: 'Official verification', summary: 'Направляет пользователя к независимой проверке банка, организации или номера через официальные каналы, а не по реквизитам из подозрительного сообщения.', tags: ['verify', 'bank', 'safe-action'], status: 'active' },
  { id: 'feature:ml-shadow', type: 'feature', title: 'ML shadow score', summary: 'Сравнивает экспериментальный ML-score с rules и показывает disagreement. Он не заменяет rule engine и не принимает live решения.', tags: ['ml', 'disagreement', 'safety'], status: 'experimental' },
  { id: 'feature:privacy', type: 'feature', title: 'Privacy controls', summary: 'Хранит ключи и доверенный контакт через Android Keystore, удаляет локальные данные по запросу и требует отдельного согласия на облако, SMS и donation.', tags: ['privacy', 'keystore', 'consent'], status: 'active' },
]

const releaseCatalog: KnowledgeNode[] = [
  { id: 'release:v2.0.2', type: 'release', title: 'v2.0.2 verified baseline', summary: 'Подтверждённая пользователем Xiaomi baseline. Любое последующее изменение должно выпускаться отдельным patch-версией и не перезаписывать этот ориентир.', tags: ['release', 'baseline', 'xiaomi'], version: '2.0.2', status: 'active' },
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
    { id: 'model:silero-vad', type: 'model', title: 'Silero VAD', summary: 'ONNX-детектор речи в аудиопотоке.', tags: ['vad', 'audio', 'onnx'], status: 'active', bytes: 2_327_524 },
    { id: 'model:lcnn-anti-spoof', type: 'model', title: 'LCNN anti-spoof', summary: 'Исследовательский checkpoint для bona-fide/spoof аудио.', tags: ['deepfake', 'audio', 'asvspoof'], status: 'experimental', bytes: 3_610_050 },
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
    { id: 'advice:phone-audio', type: 'advice', title: 'Для звонка включите громкую связь', summary: 'Android обычно не отдаёт стороннему приложению внутренний downlink call audio.', tags: ['call', 'xiaomi', 'audio'], status: 'active' },
    { id: 'advice:auto-model', type: 'advice', title: 'Автовыбор модели', summary: 'Учитывает RAM, свободное место, размер загрузки и reserve space.', tags: ['model', 'storage', 'ram'], status: 'active' },
    { id: 'diagnostic:real-xiaomi', type: 'diagnostic', title: 'Реальный Xiaomi call test', summary: 'Нужен физический телефон: эмулятор не проверяет Telecom audio route.', tags: ['qa', 'xiaomi', 'call'], status: 'blocked' },
    ...runtimeAdvice,
    ...modelNodes,
  ]

  const edges: KnowledgeEdge[] = ([
    ...featureCatalog.map((feature) => ['app:voiceshield', feature.id, 'provides'] as [string, string, string]),
    ['app:voiceshield', 'release:v2.0.2', 'current verified baseline'], ['release:v2.0.2', 'release:v2.0.0', 'succeeds'],
    ['feature:live-shield', 'feature:transcript-correction', 'feeds'], ['feature:live-shield', 'feature:ml-shadow', 'compares'],
    ['feature:live-shield', 'model:silero-vad', 'uses'], ['feature:live-shield', 'model:fastconformer', 'uses'], ['feature:transcript-correction', 'model:qolda-q4', 'can use'],
    ['feature:transcript-correction', 'dataset:kazakh-asr', 'evaluates against'], ['feature:ml-shadow', 'dataset:fraud-transfer', 'trained with'], ['model:lcnn-anti-spoof', 'dataset:asvspoof', 'trained/evaluated on'],
    ['feature:cases', 'feature:ml-shadow', 'reviews'], ['feature:live-shield', 'advice:phone-audio', 'requires'], ['app:voiceshield', 'advice:auto-model', 'uses'],
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
