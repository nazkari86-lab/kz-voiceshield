import { modelManifest, APP_VERSION } from './modelManifest'
import { fitsDevice, whisperModels, type ModelStorageInfo } from './whisperModels'
import { qoldaVariants } from './kazakhQualityPack'

export type KnowledgeNodeType = 'app' | 'model' | 'feature' | 'dataset' | 'advice' | 'diagnostic'
export type KnowledgeNode = {
  id: string
  type: KnowledgeNodeType
  title: string
  summary: string
  tags: string[]
  status?: 'active' | 'available' | 'experimental' | 'downloadable' | 'blocked'
  version?: string
  bytes?: number
}
export type KnowledgeEdge = { from: string; to: string; relation: string }
export type KnowledgeGraph = { schemaVersion: 'voiceshield.knowledge.v1'; appVersion: string; nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }

export function buildKnowledgeGraph(storage: ModelStorageInfo | null = null): KnowledgeGraph {
  const modelNodes: KnowledgeNode[] = whisperModels.map((model) => ({
    id: `model:${model.id}`,
    type: 'model',
    title: model.title,
    summary: `${model.detail}. ${model.id === 'fastconformer' ? 'Специализирована для русского и казахского.' : 'Универсальная Whisper-модель.'}`,
    tags: ['asr', 'ru', 'kz', model.tier],
    status: storage && fitsDevice(model, storage) ? 'available' : 'blocked',
    bytes: model.size,
  }))
  modelNodes.push(
    { id: 'model:qolda-q4', type: 'model', title: 'Qolda Q4_K_M', summary: 'Локальный казахско-русский semantic coprocessor.', tags: ['llm', 'kz', 'ru', 'semantic'], status: 'downloadable', bytes: qoldaVariants.balanced.size },
    { id: 'model:qolda-q5', type: 'model', title: 'Qolda Q5_K_M', summary: 'Более точный локальный разбор казахского текста.', tags: ['llm', 'kz', 'ru', 'semantic'], status: 'downloadable', bytes: qoldaVariants.maximum.size },
    { id: 'model:silero-vad', type: 'model', title: 'Silero VAD', summary: 'ONNX-детектор речи в аудиопотоке.', tags: ['vad', 'audio', 'onnx'], status: 'active', bytes: 2_327_524 },
    { id: 'model:lcnn-anti-spoof', type: 'model', title: 'LCNN anti-spoof', summary: 'Исследовательский checkpoint для bona-fide/spoof аудио.', tags: ['deepfake', 'audio', 'asvspoof'], status: 'experimental', bytes: 3_610_050 },
  )

  const nodes: KnowledgeNode[] = [
    { id: 'app:voiceshield', type: 'app', title: 'KZ VoiceShield', summary: 'Локальная защита от телефонного мошенничества.', tags: ['product', 'privacy'], version: APP_VERSION, status: 'active' },
    { id: 'feature:live-shield', type: 'feature', title: 'Live Shield', summary: 'Слушает доступный аудиоканал, строит транскрипт и считает rule-score.', tags: ['call', 'live', 'rules'], status: 'active' },
    { id: 'feature:transcript-correction', type: 'feature', title: 'KSC2 correction', summary: 'Определяет русский/казахский язык и исправляет вероятные ASR-ошибки, сохраняя raw transcript.', tags: ['kz', 'ru', 'asr', 'correction'], status: 'active' },
    { id: 'feature:ml-shadow', type: 'feature', title: 'ML shadow score', summary: 'Сравнивает ML с правилами и показывает disagreement, не заменяя rules.', tags: ['ml', 'disagreement', 'safety'], status: 'experimental' },
    { id: 'feature:review-workflow', type: 'feature', title: 'Reviewer workflow', summary: 'Дела, статусы new/reviewing/escalated/closed и audit log.', tags: ['backend', 'reviewer', 'audit'], status: 'available' },
    { id: 'dataset:fraud-transfer', type: 'dataset', title: 'Fraud transfer corpora', summary: 'DiFraud и multilingual fraud data; transfer-only, не RU/KZ gold labels.', tags: ['fraud', 'text', 'transfer'], status: 'experimental' },
    { id: 'dataset:asvspoof', type: 'dataset', title: 'ASVspoof2021 DF', summary: 'Bona-fide/deepfake audio labels for anti-spoof evaluation.', tags: ['deepfake', 'audio', 'benchmark'], status: 'available' },
    { id: 'dataset:kazakh-asr', type: 'dataset', title: 'Kazakh Speech Dataset', summary: 'Казахская речь и транскрипты для ASR quality evaluation.', tags: ['kz', 'asr', 'speech'], status: 'available' },
    { id: 'advice:phone-audio', type: 'advice', title: 'Для звонка включите громкую связь', summary: 'Android обычно не отдаёт стороннему приложению внутренний downlink call audio.', tags: ['call', 'xiaomi', 'audio'], status: 'active' },
    { id: 'advice:auto-model', type: 'advice', title: 'Автовыбор модели', summary: 'Учитывает RAM, свободное место, размер загрузки и reserve space.', tags: ['model', 'storage', 'ram'], status: 'active' },
    { id: 'diagnostic:real-xiaomi', type: 'diagnostic', title: 'Реальный Xiaomi call test', summary: 'Нужен физический телефон: эмулятор не проверяет Telecom audio route.', tags: ['qa', 'xiaomi', 'call'], status: 'blocked' },
    ...modelNodes,
  ]

  const edges: KnowledgeEdge[] = ([
    ['app:voiceshield', 'feature:live-shield', 'provides'], ['feature:live-shield', 'feature:transcript-correction', 'feeds'], ['feature:live-shield', 'feature:ml-shadow', 'compares'],
    ['feature:live-shield', 'model:silero-vad', 'uses'], ['feature:live-shield', 'model:fastconformer', 'uses'], ['feature:transcript-correction', 'model:qolda-q4', 'can use'],
    ['feature:transcript-correction', 'dataset:kazakh-asr', 'evaluates against'], ['feature:ml-shadow', 'dataset:fraud-transfer', 'trained with'], ['model:lcnn-anti-spoof', 'dataset:asvspoof', 'trained/evaluated on'],
    ['feature:review-workflow', 'feature:ml-shadow', 'reviews'], ['feature:live-shield', 'advice:phone-audio', 'requires'], ['app:voiceshield', 'advice:auto-model', 'uses'],
    ['diagnostic:real-xiaomi', 'feature:live-shield', 'validates'],
  ] as Array<[string, string, string]>).map(([from, to, relation]) => ({ from, to, relation }))

  return { schemaVersion: 'voiceshield.knowledge.v1', appVersion: APP_VERSION, nodes, edges }
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
