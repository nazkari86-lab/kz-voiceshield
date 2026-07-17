import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView,
  Image, Share, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import {
  GEMMA_MODEL_BYTES, GEMMA_MODEL_FILE, GEMMA_MODEL_SHA256,
  GEMMA_MODEL_SIZE_MB, GEMMA_MODEL_URL, GEMMA_TERMS_URL,
} from '../bridge/LLMBridge'
import { modelEvents, ModelDownloader } from '../bridge/WhisperBridge'
import {
  LEGACY_GGUF_MODEL_FILE, LOCAL_IMPORTED_MODEL_FILE,
  LOCAL_MODELS_STORAGE_KEY, parseInstalledLocalModels,
  type InstalledLocalModel,
} from '../bridge/LocalLlmBridge'
import type { GgufVariant, PublicGgufModel } from '../data/huggingFaceCatalog'
import type { ModelStorageInfo } from '../data/whisperModels'
import { buildPrompt, buildUserMessage, preserveTextWindow, QUICK_QUESTIONS, SYSTEM_PROMPT } from '../utils/llmPrompts'
import { colors } from '../theme'
import { LocalModelCatalogView } from './LocalModelCatalogView'
import { CloudProviderCatalogView } from './CloudProviderCatalogView'
import { Card, SectionTitle } from './ui'
import type { AssistantEngine, OnDeviceAiRuntime } from '../hooks/useOnDeviceAiRuntime'
import { buildKazakhIntelligenceContext, validateKazakhResponse, type KazakhResponseQuality } from '../utils/kazakhIntelligence'
import { enhanceTranscript } from '../utils/transcriptEnhancer'
import { adviceForModelError, buildKnowledgeGraph } from '../data/knowledgeGraph'
import { ChatAttachmentModule, chatAttachmentEvents } from '../bridge/ChatAttachmentBridge'
import { VoiceMessageModule } from '../bridge/VoiceMessageBridge'
import { loadChatHistory, saveChatHistory } from '../services/chatHistory'
import { DAILY_CLOUD_TOKEN_LIMIT, canUseCloud, estimateTokens, getCloudUsage, recordCloudUsage } from '../services/cloudBudget'
import { CLOUD_OUTPUT_TOKEN_BUDGET } from '../services/cloudAiClient'
import {
  assessAttachmentQuality, buildAttachmentEvidenceBundle, cloudAttachmentPrivacySummary, compareAttachments, createChatId, createChatSession,
  extractAttachmentIndicators, extractReceiptFields, inspectAttachment, inspectLinkOffline, titleForChat, toCaseEvidenceItem, type ChatSession, type WorkspaceAttachment, type WorkspaceMessage,
} from '../utils/chatWorkspace'

type ChatMessage = WorkspaceMessage & { quality?: KazakhResponseQuality }

type Props = { transcript: string; languageContext?: string; modelBasePath?: string; attachmentText?: string; ai: OnDeviceAiRuntime }
const GEMMA_TERMS_ACCEPTED_KEY = 'voiceshield.gemma.terms.v1'
const MAX_CHAT_ATTACHMENTS = 4
const CHAT_TEMPLATES = [
  'Проверь вложение на признаки мошенничества и укажи конкретные цитаты.',
  'Составь короткий план безопасных действий для пользователя.',
  'Подготовь структурированный текст для обращения в банк или FinPol.',
  'Объясни содержание простыми словами и отметь, что нужно проверить вручную.',
]

const importedModelRecord = (source: 'imported' | 'legacy', fileName: string): InstalledLocalModel => ({
  id: `${source}:${fileName}`,
  title: 'Импортированная GGUF-модель',
  repoId: 'Локальный файл',
  fileName,
  sourceFileName: fileName,
  quantization: 'GGUF',
  size: 0,
  sha256: '',
  license: 'проверьте источник файла',
  downloadedAt: new Date().toISOString(),
  source,
})

export function LLMAssistantView({ transcript, languageContext = '', modelBasePath, attachmentText = '', ai }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [loadingModel, setLoadingModel] = useState(false)
  const [showCatalog, setShowCatalog] = useState(false)
  const [showCloudCatalog, setShowCloudCatalog] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [modelPath, setModelPath] = useState<string | null>(modelBasePath ?? null)
  const [installedModels, setInstalledModels] = useState<InstalledLocalModel[]>([])
  const [downloadingVariantId, setDownloadingVariantId] = useState<string | null>(null)
  const [storageInfo, setStorageInfo] = useState<ModelStorageInfo>({ availableBytes: 0, totalBytes: 0, ramBytes: 0 })
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [chatAttachments, setChatAttachments] = useState<WorkspaceAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [cloudAttachmentConsent, setCloudAttachmentConsent] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [showCaseWorkspace, setShowCaseWorkspace] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [showComparison, setShowComparison] = useState(false)
  const [cloudTokensUsed, setCloudTokensUsed] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const isAtBottomRef = useRef(true)
  const currentTokensRef = useRef('')
  const modelReady = ai.modelReady
  const engine = ai.engine
  const activeLocalModelId = ai.activeLocalModelId
  const modelBusy = loadingModel || ai.loading
  const visibleError = loadError ?? ai.runtimeError
  const recoveryAdvice = useMemo(() => visibleError ? adviceForModelError(visibleError, buildKnowledgeGraph(storageInfo)) : undefined, [storageInfo, visibleError])
  const modelKazakhContext = useMemo(
    () => buildKazakhIntelligenceContext(enhanceTranscript(transcript), ai.engine, ai.modelName),
    [ai.engine, ai.modelName, transcript],
  )
  const attachmentEvidence = useMemo(() => chatAttachments.map((attachment) => ({
    attachment, evidence: inspectAttachment(attachment), indicators: extractAttachmentIndicators(attachment),
    quality: assessAttachmentQuality(attachment), receipt: extractReceiptFields(attachment),
  })), [chatAttachments])
  const cloudPrivacySummary = useMemo(() => cloudAttachmentPrivacySummary(chatAttachments), [chatAttachments])
  const documentComparison = useMemo(() => {
    const [left, right] = chatAttachments
    return left && right ? compareAttachments(left, right) : null
  }, [chatAttachments])
  const activeCase = useMemo(() => sessions.find((session) => session.id === activeSessionId) ?? null, [activeSessionId, sessions])

  const persistChat = useCallback((sessionId: string, nextMessages: ChatMessage[], attachments: WorkspaceAttachment[] = []) => {
    setSessions((previous) => {
      const current = previous.find((session) => session.id === sessionId) ?? createChatSession()
      const now = new Date().toISOString()
      const session: ChatSession = {
        ...current,
        id: sessionId,
        title: titleForChat(nextMessages),
        updatedAt: now,
        messages: nextMessages.map(({ quality: _quality, ...message }) => ({ ...message, streaming: undefined })),
        evidence: [...attachments.map(toCaseEvidenceItem), ...(current.evidence ?? [])].filter((item, index, all) => all.findIndex((candidate) => candidate.fileName === item.fileName && candidate.excerpt === item.excerpt) === index).slice(0, 20),
        notes: current.notes ?? [],
      }
      const updated = [session, ...previous.filter((item) => item.id !== sessionId)]
      void saveChatHistory(updated).catch(() => undefined)
      return updated
    })
  }, [])

  useEffect(() => {
    void AsyncStorage.getItem(GEMMA_TERMS_ACCEPTED_KEY).then(value => setTermsAccepted(value === 'accepted')).catch(() => undefined)
    if (!modelBasePath) {
      void ModelDownloader.getVerifiedModelPath(GEMMA_MODEL_FILE, GEMMA_MODEL_SHA256, GEMMA_MODEL_BYTES)
        .then(setModelPath)
        .catch(() => undefined)
    }
    void (async () => {
      const [raw, info, importedPath, legacyPath] = await Promise.all([
        AsyncStorage.getItem(LOCAL_MODELS_STORAGE_KEY),
        ModelDownloader.getStorageInfo(),
        ModelDownloader.getModelPath(LOCAL_IMPORTED_MODEL_FILE),
        ModelDownloader.getModelPath(LEGACY_GGUF_MODEL_FILE),
      ])
      const saved = parseInstalledLocalModels(raw)
      const candidates = [...saved]
      if (importedPath && !candidates.some((item) => item.fileName === LOCAL_IMPORTED_MODEL_FILE)) {
        candidates.push(importedModelRecord('imported', LOCAL_IMPORTED_MODEL_FILE))
      }
      if (legacyPath && !candidates.some((item) => item.fileName === LEGACY_GGUF_MODEL_FILE)) {
        candidates.push(importedModelRecord('legacy', LEGACY_GGUF_MODEL_FILE))
      }
      const verified = (await Promise.all(candidates.map(async (item) => {
        const path = item.sha256
          ? await ModelDownloader.getVerifiedModelPath(item.fileName, item.sha256, item.size)
          : await ModelDownloader.getModelPath(item.fileName)
        return path ? item : null
      }))).filter((item): item is InstalledLocalModel => item !== null)
      setInstalledModels(verified)
      setStorageInfo(info)
      await AsyncStorage.setItem(LOCAL_MODELS_STORAGE_KEY, JSON.stringify(verified))
    })().catch(() => undefined)
  }, [modelBasePath])

  useEffect(() => {
    void loadChatHistory().then(setSessions).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (engine !== 'cloud') return
    void getCloudUsage().then((usage) => setCloudTokensUsed(usage.usedTokens)).catch(() => undefined)
  }, [engine])

  useEffect(() => {
    const progressSub = modelEvents.addListener('VS_MODEL_DOWNLOAD_PROGRESS', (payload: { progress?: number }) => {
      setDownloadProgress(payload.progress ?? null)
    })
    return () => progressSub.remove()
  }, [])

  const loadModel = useCallback(async () => {
    setLoadingModel(true)
    setLoadError(null)
    try {
      const path = modelPath ?? (modelBasePath ? `${modelBasePath}${modelBasePath.endsWith('/') ? '' : '/'}${GEMMA_MODEL_FILE}` : null)
      if (!path) throw new Error('Download Gemma first, then import the .task file from Downloads.')
      await ai.loadGemma(path)
      setShowCatalog(false)
      setShowCloudCatalog(false)
    } catch (e: any) {
      setLoadError(e?.message ?? 'Failed to load model')
    } finally {
      setLoadingModel(false)
    }
  }, [ai, modelBasePath, modelPath])

  const importModel = useCallback(async () => {
    setLoadingModel(true)
    setLoadError(null)
    try {
      const path = await ModelDownloader.importGemmaModel()
      setModelPath(path)
      await ai.loadGemma(path)
      setShowCatalog(false)
      setShowCloudCatalog(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not import the Gemma model'
      if (!message.includes('MODEL_IMPORT_CANCELLED')) setLoadError(message)
    } finally {
      setLoadingModel(false)
    }
  }, [ai])

  const persistInstalledModels = useCallback(async (next: InstalledLocalModel[]) => {
    setInstalledModels(next)
    await AsyncStorage.setItem(LOCAL_MODELS_STORAGE_KEY, JSON.stringify(next))
  }, [])

  const refreshStorage = useCallback(async () => {
    setStorageInfo(await ModelDownloader.getStorageInfo())
  }, [])

  const startLocalModel = useCallback(async (model: InstalledLocalModel, knownPath?: string) => {
    const path = knownPath ?? await ModelDownloader.getModelPath(model.fileName)
    if (!path) throw new Error('Локальный файл модели не найден.')
    await ai.loadLocalModel(model, path)
    setShowCatalog(false)
  }, [ai])

  const loadLocalModel = useCallback(async (model: InstalledLocalModel) => {
    if (engine === 'local' && activeLocalModelId === model.id && modelReady) {
      setShowCatalog(false)
      return
    }
    setLoadingModel(true)
    setLoadError(null)
    try {
      await startLocalModel(model)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Не удалось запустить локальную модель')
    } finally {
      setLoadingModel(false)
    }
  }, [activeLocalModelId, engine, modelReady, startLocalModel])

  const importLocalModel = useCallback(async () => {
    setLoadingModel(true)
    setLoadError(null)
    try {
      const path = await ModelDownloader.importGgufModel()
      const item = importedModelRecord('imported', LOCAL_IMPORTED_MODEL_FILE)
      const next = [...installedModels.filter((model) => model.fileName !== item.fileName), item]
      await persistInstalledModels(next)
      await startLocalModel(item, path)
      await refreshStorage()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось импортировать GGUF-модель'
      if (!message.includes('MODEL_IMPORT_CANCELLED')) setLoadError(message)
    } finally {
      setLoadingModel(false)
    }
  }, [installedModels, persistInstalledModels, refreshStorage, startLocalModel])

  const downloadLocalModel = useCallback(async (model: PublicGgufModel, variant: GgufVariant) => {
    setLoadingModel(true)
    setDownloadingVariantId(variant.id)
    setDownloadProgress(0)
    setLoadError(null)
    try {
      const path = await ModelDownloader.downloadGgufModel(
        variant.downloadUrl, variant.localFileName, variant.sha256, variant.size,
      )
      const item: InstalledLocalModel = {
        id: variant.id,
        title: model.id.split('/').at(-1)?.replace(/-GGUF$/i, '') || model.id,
        repoId: model.id,
        fileName: variant.localFileName,
        sourceFileName: variant.fileName,
        quantization: variant.quantization,
        size: variant.size,
        sha256: variant.sha256,
        license: model.license,
        downloadedAt: new Date().toISOString(),
        source: 'huggingface',
      }
      const next = [...installedModels.filter((installed) => installed.id !== item.id && installed.fileName !== item.fileName), item]
      await persistInstalledModels(next)
      await startLocalModel(item, path)
      await refreshStorage()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Не удалось скачать локальную модель')
    } finally {
      setDownloadingVariantId(null)
      setDownloadProgress(null)
      setLoadingModel(false)
    }
  }, [installedModels, persistInstalledModels, refreshStorage, startLocalModel])

  const deleteLocalModel = useCallback(async (model: InstalledLocalModel) => {
    setLoadingModel(true)
    setLoadError(null)
    try {
      if (activeLocalModelId === model.id) {
        await ai.clearLocalModel(model.id)
      }
      const deleted = await ModelDownloader.deleteModel(model.fileName)
      if (!deleted) throw new Error('Не удалось удалить файл модели.')
      await persistInstalledModels(installedModels.filter((installed) => installed.id !== model.id && installed.fileName !== model.fileName))
      await refreshStorage()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Не удалось удалить модель')
    } finally {
      setLoadingModel(false)
    }
  }, [activeLocalModelId, ai, installedModels, persistInstalledModels, refreshStorage])

  const downloadModel = useCallback(async () => {
    if (!termsAccepted) {
      setLoadError('Подтвердите принятие условий Gemma перед загрузкой модели.')
      return
    }
    setLoadingModel(true)
    setLoadError(null)
    setDownloadProgress(0)
    try {
      const path = await ModelDownloader.downloadModel(
        GEMMA_MODEL_URL,
        GEMMA_MODEL_FILE,
        GEMMA_MODEL_SHA256,
        GEMMA_MODEL_BYTES,
      )
      setModelPath(path)
      await ai.loadGemma(path)
      setShowCatalog(false)
      setShowCloudCatalog(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось скачать модель Gemma'
      setLoadError(message)
    } finally {
      setLoadingModel(false)
      setDownloadProgress(null)
    }
  }, [ai, termsAccepted])

  const acceptTerms = useCallback(async () => {
    const nextValue = !termsAccepted
    setTermsAccepted(nextValue)
    await AsyncStorage.setItem(GEMMA_TERMS_ACCEPTED_KEY, nextValue ? 'accepted' : 'declined')
  }, [termsAccepted])

  const addAttachment = useCallback((attachment: WorkspaceAttachment) => {
    setChatAttachments((previous) => {
      if (previous.length >= MAX_CHAT_ATTACHMENTS) {
        setAttachmentError(`Можно добавить не более ${MAX_CHAT_ATTACHMENTS} вложений за один запрос.`)
        return previous
      }
      if (previous.some((item) => item.uri === attachment.uri && item.fileName === attachment.fileName)) return previous
      return [...previous, attachment]
    })
    setCloudAttachmentConsent(false)
  }, [])

  const send = useCallback(async (text: string) => {
    const question = text.trim()
    const attachments = chatAttachments
    if ((!question && attachments.length === 0) || generating || ai.generating || !modelReady) return
    if (engine === 'cloud' && attachments.length > 0 && !cloudAttachmentConsent) {
      setAttachmentError('Подтвердите передачу обезличенного текста вложений в облачный AI.')
      return
    }
    const estimatedCloudTokens = estimateTokens([question, transcript, ...attachments.map((attachment) => attachment.text)].join('\n')) + CLOUD_OUTPUT_TOKEN_BUDGET
    if (engine === 'cloud' && !canUseCloud({ date: new Date().toISOString().slice(0, 10), usedTokens: cloudTokensUsed }, estimatedCloudTokens)) {
      setAttachmentError('Дневной локальный лимит облачных токенов исчерпан. Переключитесь на локальную модель или повторите попытку завтра.')
      return
    }
    const sessionId = activeSessionId ?? createChatId()
    const conversationContext = messages.filter((message) => !message.streaming).slice(-6)
      .map((message) => `${message.role === 'user' ? 'Пользователь' : 'VoiceShield AI'}: ${message.text}`).join('\n')
    const userMsg: ChatMessage = {
      id: createChatId('message'),
      role: 'user',
      text: question || `Проанализируй прикрепленные файлы: ${attachments.map((attachment) => attachment.fileName).join(', ')}.`,
      attachmentNames: attachments.map((attachment) => attachment.fileName),
      createdAt: new Date().toISOString(),
    }
    const pendingAnswer: ChatMessage = { id: createChatId('message'), role: 'assistant', text: '', streaming: true, createdAt: new Date().toISOString() }
    setActiveSessionId(sessionId)
    setMessages(prev => [...prev, userMsg, pendingAnswer])
    setInputText('')
    setChatAttachments([])
    setCloudAttachmentConsent(false)
    setGenerating(true)
    currentTokensRef.current = ''
    isAtBottomRef.current = true
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
    try {
      const contextualQuestion = [
        question,
        conversationContext ? `Последний контекст этого диалога:\n${conversationContext}` : '',
        ...attachments.map((attachment, index) => {
          const evidence = attachmentEvidence[index]?.evidence
          const references = evidence?.references.map((reference) => `§${reference.line}: ${reference.text}`).join('\n') || 'Нет rule-based ссылок.'
          return `Вложение ${index + 1}: ${attachment.fileName}${attachment.truncated ? ' (показано начало)' : ''}.\nЛокальная оценка: ${evidence?.risk ?? 'low'} ${evidence?.score ?? 0}/100; схема: ${evidence?.scheme ?? 'не определена'}.\nФрагменты: ${references}\nЕсли опираешься на этот файл, указывай §номер фрагмента рядом с выводом.\nТекст:\n${preserveTextWindow(attachment.text, 7_000)}`
        }),
        languageContext ? `Контекст знаний VoiceShield и KSC2 (не доказательство): ${preserveTextWindow(languageContext, 8_000)}` : '',
        `Казахский semantic runtime: ${modelKazakhContext.slice(0, 1000)}`,
        '',
      ].filter(Boolean).join('\n\n')
      const userMessage = buildUserMessage(`${contextualQuestion}\n\n`, transcript)
      const fullPrompt = buildPrompt(SYSTEM_PROMPT, `${contextualQuestion}\n\n`, transcript)
      const full = await ai.generate({
        owner: 'assistant',
        gemmaPrompt: fullPrompt,
        localSystemPrompt: SYSTEM_PROMPT,
        localUserMessage: userMessage,
        onToken: (token) => {
          currentTokensRef.current += token
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (!last || last.role !== 'assistant' || !last.streaming) return prev
            return [...prev.slice(0, -1), { ...last, text: currentTokensRef.current }]
          })
        },
      })
      const quality = validateKazakhResponse(transcript, full)
      if (engine === 'cloud') {
        const usage = await recordCloudUsage(estimatedCloudTokens + estimateTokens(full)).catch(() => null)
        if (usage) setCloudTokensUsed(usage.usedTokens)
      }
      setMessages(prev => {
        const finalMessages = [...prev.slice(0, -1), { ...pendingAnswer, text: full, streaming: false, quality }]
        persistChat(sessionId, finalMessages, attachments)
        return finalMessages
      })
      setGenerating(false)
      currentTokensRef.current = ''
    } catch (e: any) {
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.streaming) {
          const finalMessages = [...prev.slice(0, -1), { ...pendingAnswer, text: `⚠ ${e?.message ?? 'Error'}` }]
          persistChat(sessionId, finalMessages, attachments)
          return finalMessages
        }
        return prev
      })
      setGenerating(false)
    }
  }, [activeSessionId, ai, attachmentEvidence, chatAttachments, cloudAttachmentConsent, cloudTokensUsed, engine, generating, languageContext, messages, modelKazakhContext, modelReady, persistChat, transcript])

  const attachFile = useCallback(async () => {
    if (!ChatAttachmentModule) {
      setAttachmentError('Выбор файлов будет доступен после обновления приложения.')
      return
    }
    setAttachmentError(null)
    try {
      addAttachment(await ChatAttachmentModule.pickReadableAttachment())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось открыть файл.'
      if (!message.includes('CHAT_ATTACHMENT_CANCELLED')) setAttachmentError(message)
    }
  }, [addAttachment])

  const attachAudio = useCallback(async () => {
    if (!VoiceMessageModule) {
      setAttachmentError('Расшифровка аудио доступна в Android-приложении.')
      return
    }
    setAttachmentError(null)
    try {
      const result = await VoiceMessageModule.pickAndTranscribe('ru')
      addAttachment({
        fileName: `audio-transcript-${new Date().toISOString().slice(0, 10)}.txt`,
        mimeType: 'audio/transcript', kind: 'audio', text: result.transcript, truncated: false,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось расшифровать аудио.'
      if (!message.includes('CANCELLED')) setAttachmentError(message)
    }
  }, [addAttachment])

  useEffect(() => {
    const acceptShared = () => {
      void ChatAttachmentModule?.consumePendingSharedAttachment().then((attachment) => {
        if (attachment) addAttachment(attachment)
      }).catch(() => undefined)
    }
    const subscription = chatAttachmentEvents.addListener('VS_SHARED_CHAT_ATTACHMENT', acceptShared)
    acceptShared()
    return () => subscription.remove()
  }, [addAttachment])

  const startNewChat = useCallback(() => {
    setMessages([])
    setActiveSessionId(null)
    setChatAttachments([])
    setAttachmentError(null)
    setShowHistory(false)
  }, [])

  const openSession = useCallback((session: ChatSession) => {
    setMessages(session.messages)
    setActiveSessionId(session.id)
    setChatAttachments([])
    setShowHistory(false)
  }, [])

  const deleteSession = useCallback((sessionId: string) => {
    setSessions((previous) => {
      const updated = previous.filter((session) => session.id !== sessionId)
      void saveChatHistory(updated).catch(() => undefined)
      return updated
    })
    if (sessionId === activeSessionId) startNewChat()
  }, [activeSessionId, startNewChat])

  const exportEvidence = useCallback(() => {
    const caseSummary = activeCase ? [
      `AI case: ${activeCase.title}`,
      `Timeline: ${activeCase.messages.map((message) => `${message.createdAt} ${message.role}: ${message.text}`).join('\n')}`,
      `Notes: ${(activeCase.notes ?? []).join('\n') || 'none'}`,
      `Evidence metadata: ${(activeCase.evidence ?? []).map((item) => `${item.fileName} — ${item.risk} ${item.score}/100`).join('\n') || 'none'}`,
    ].join('\n\n') : ''
    const bundle = [caseSummary, buildAttachmentEvidenceBundle(chatAttachments)].filter(Boolean).join('\n\n---\n\n')
    if (!bundle) return
    void Share.share({ title: 'VoiceShield evidence bundle', message: bundle }).catch(() => undefined)
  }, [activeCase, chatAttachments])

  const saveCaseNote = useCallback(() => {
    const note = noteDraft.trim()
    if (!note) return
    const sessionId = activeSessionId ?? createChatId()
    setActiveSessionId(sessionId)
    setSessions((previous) => {
      const current = previous.find((session) => session.id === sessionId) ?? { ...createChatSession(), id: sessionId }
      const updatedSession = { ...current, updatedAt: new Date().toISOString(), notes: [note, ...(current.notes ?? [])].slice(0, 20) }
      const updated = [updatedSession, ...previous.filter((session) => session.id !== sessionId)]
      void saveChatHistory(updated).catch(() => undefined)
      return updated
    })
    setNoteDraft('')
  }, [activeSessionId, noteDraft])

  const sendQuick = useCallback((q: (typeof QUICK_QUESTIONS)[number]) => {
    void send(q.prompt)
  }, [send])

  const continueResponse = useCallback(() => {
    void send('Продолжи предыдущий ответ точно с места остановки. Не повторяй уже написанное и закончи все пункты.')
  }, [send])

  const stop = useCallback(() => {
    void ai.stopGeneration('assistant')
    setGenerating(false)
  }, [ai])

  const selectEngine = useCallback(async (next: AssistantEngine) => {
    setLoadError(null)
    await ai.selectEngine(next)
    if (next === 'gemma') {
      setShowCatalog(false)
      setShowCloudCatalog(false)
      await loadModel()
      return
    }
    setShowCatalog(next === 'local')
    setShowCloudCatalog(next === 'cloud')
  }, [ai, loadModel])

  if (!modelReady || showCatalog || showCloudCatalog) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.setupContent} keyboardShouldPersistTaps="handled">
        <SectionTitle>VoiceShield AI</SectionTitle>
        <View style={styles.engineRow}>
          <TouchableOpacity style={[styles.engineChip, engine === 'gemma' && styles.engineChipActive]} onPress={() => { void selectEngine('gemma') }}>
            <Text style={[styles.engineChipText, engine === 'gemma' && styles.engineChipTextActive]}>Gemma</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.engineChip, engine === 'local' && styles.engineChipActive]} onPress={() => { void selectEngine('local') }}>
            <Text style={[styles.engineChipText, engine === 'local' && styles.engineChipTextActive]}>Локальные</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.engineChip, engine === 'cloud' && styles.engineChipActive]} onPress={() => { void selectEngine('cloud') }}>
            <Text style={[styles.engineChipText, engine === 'cloud' && styles.engineChipTextActive]}>API модели</Text>
          </TouchableOpacity>
        </View>
        {engine === 'cloud' ? (
          <>
            <View style={styles.cloudWarning}><Text style={styles.cloudWarningTitle}>Облачный режим: данные покидают телефон</Text><Text style={styles.cloudWarningText}>Текст транскрипта может быть отправлен выбранному провайдеру. Не включайте этот режим для конфиденциальных разговоров. Проверьте тариф, политику хранения и согласие перед подключением.</Text></View>
            <CloudProviderCatalogView
            activeConfig={ai.activeCloudConfig}
            busy={modelBusy}
            error={visibleError}
            onActivate={async (config) => {
              setLoadError(null)
              try {
                await ai.loadCloudModel(config)
                setShowCloudCatalog(false)
              } catch (error) {
                setLoadError(error instanceof Error ? error.message : 'Не удалось активировать API-модель.')
              }
            }}
            onCredentialRemoved={ai.invalidateCloudCredentials}
            />
          </>
        ) : engine === 'local' ? (
          <LocalModelCatalogView
            installedModels={installedModels}
            activeModelId={activeLocalModelId}
            availableBytes={storageInfo.availableBytes}
            ramBytes={storageInfo.ramBytes}
            busy={modelBusy}
            downloadingVariantId={downloadingVariantId}
            downloadProgress={downloadProgress}
            error={visibleError}
            onDelete={deleteLocalModel}
            onDownload={downloadLocalModel}
            onImport={importLocalModel}
            onLoad={loadLocalModel}
          />
        ) : (
          <Card>
            <Text style={styles.setupTitle}>Нейросеть не загружена</Text>
          <Text style={styles.setupText}>
            Модель Gemma 3 1B IT (~{GEMMA_MODEL_SIZE_MB}МБ) анализирует транскрипты звонков прямо на устройстве.
            Данные не покидают телефон.
          </Text>
          <Text style={styles.setupSteps}>Загрузка происходит прямо в приложении. Файл проверяется по точному размеру и SHA-256 перед запуском.</Text>
          <TouchableOpacity style={styles.termsRow} onPress={() => { void acceptTerms() }} disabled={modelBusy}>
            <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
              {termsAccepted && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <Text style={styles.termsText}>Я принимаю условия использования Gemma</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { void Linking.openURL(GEMMA_TERMS_URL) }} disabled={modelBusy}>
            <Text style={styles.termsLink}>Открыть условия Gemma</Text>
          </TouchableOpacity>
          {visibleError && <Text style={styles.error}>{visibleError}</Text>}
          {recoveryAdvice && <Text style={styles.recoveryAdvice}>{recoveryAdvice.summary}</Text>}
          {visibleError && (
            <TouchableOpacity
              style={styles.importBtn}
              onPress={() => {
                setLoadError(null)
                void ai.selectEngine('local').then(() => { setShowCatalog(true); setShowCloudCatalog(false) })
              }}
              disabled={modelBusy}
            >
              <Text style={styles.importBtnText}>Открыть стабильный каталог GGUF</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.loadBtn, modelBusy && styles.loadBtnDisabled]}
            onPress={modelPath ? loadModel : downloadModel}
            disabled={modelBusy}
          >
            {modelBusy
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.loadBtnText}>{modelPath ? 'Запустить AI assistant' : `Скачать AI assistant (${GEMMA_MODEL_SIZE_MB} МБ)`}</Text>}
          </TouchableOpacity>
          {downloadProgress !== null && <Text style={styles.progressText}>Загрузка: {downloadProgress}%</Text>}
          <TouchableOpacity style={[styles.importBtn, modelBusy && styles.loadBtnDisabled]} onPress={importModel} disabled={modelBusy}>
            <Text style={styles.importBtnText}>Уже скачан файл? Импортировать</Text>
          </TouchableOpacity>
          </Card>
        )}
      </ScrollView>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SectionTitle>VoiceShield AI</SectionTitle>
      <View style={styles.engineRow}>
        <TouchableOpacity style={[styles.engineChip, engine === 'gemma' && styles.engineChipActive]} onPress={() => { void selectEngine('gemma') }}>
          <Text style={[styles.engineChipText, engine === 'gemma' && styles.engineChipTextActive]}>Gemma</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.engineChip, engine === 'local' && styles.engineChipActive]} onPress={() => { void selectEngine('local') }}>
          <Text style={[styles.engineChipText, engine === 'local' && styles.engineChipTextActive]}>Локальные</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.engineChip, engine === 'cloud' && styles.engineChipActive]} onPress={() => { void selectEngine('cloud') }}>
          <Text style={[styles.engineChipText, engine === 'cloud' && styles.engineChipTextActive]}>API модели</Text>
        </TouchableOpacity>
      </View>

      {engine === 'local' && (
        <TouchableOpacity style={styles.switchModelButton} onPress={() => setShowCatalog(true)} disabled={generating || ai.generating}>
          <Text style={styles.switchModelText}>Сменить локальную модель</Text>
        </TouchableOpacity>
      )}

      {engine === 'cloud' && (
        <>
          <View style={styles.cloudWarning}><Text style={styles.cloudWarningTitle}>Облачный AI активен</Text><Text style={styles.cloudWarningText}>Транскрипт отправляется выбранному API-провайдеру после согласия. Для полной приватности переключитесь на Gemma или локальную GGUF-модель.</Text></View>
          <Text style={styles.cloudBudget}>Локальный дневной лимит: {cloudTokensUsed.toLocaleString()} / {DAILY_CLOUD_TOKEN_LIMIT.toLocaleString()} токенов. Цена зависит от выбранного провайдера и модели.</Text>
          <TouchableOpacity style={styles.switchModelButton} onPress={() => setShowCloudCatalog(true)} disabled={generating || ai.generating}><Text style={styles.switchModelText}>Сменить API-модель</Text></TouchableOpacity>
        </>
      )}

      <View style={styles.chatToolbar}>
        <TouchableOpacity style={styles.toolbarButton} onPress={startNewChat} disabled={generating || ai.generating}><Text style={styles.toolbarButtonText}>Новый чат</Text></TouchableOpacity>
        <TouchableOpacity style={styles.toolbarButton} onPress={() => setShowHistory((current) => !current)} disabled={generating || ai.generating}><Text style={styles.toolbarButtonText}>История ({sessions.length})</Text></TouchableOpacity>
        <TouchableOpacity style={styles.toolbarButton} onPress={() => setShowCaseWorkspace((current) => !current)}><Text style={styles.toolbarButtonText}>Дело</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.toolbarButton, chatAttachments.length === 0 && !activeCase && styles.toolbarButtonDisabled]} onPress={exportEvidence} disabled={chatAttachments.length === 0 && !activeCase}><Text style={styles.toolbarButtonText}>Экспорт</Text></TouchableOpacity>
      </View>

      {showCaseWorkspace && (
        <View style={styles.casePanel}>
          <Text style={styles.casePanelTitle}>AI CASE WORKSPACE</Text>
          <Text style={styles.casePanelText}>Временная шкала, заметки и metadata доказательств зашифрованы на устройстве. Локальные заметки не добавляются в облачный запрос автоматически.</Text>
          <View style={styles.noteRow}>
            <TextInput value={noteDraft} onChangeText={setNoteDraft} placeholder="Личная заметка по делу" placeholderTextColor={colors.muted} style={styles.noteInput} multiline maxLength={500} />
            <TouchableOpacity style={styles.noteSave} onPress={saveCaseNote}><Text style={styles.noteSaveText}>Сохранить</Text></TouchableOpacity>
          </View>
          {(activeCase?.notes ?? []).slice(0, 3).map((note, index) => <Text key={`${note}-${index}`} style={styles.caseNote}>• {note}</Text>)}
          {(activeCase?.evidence ?? []).slice(0, 4).map((item) => <Text key={item.id} style={styles.caseEvidence}>• {item.fileName}: {item.risk.toUpperCase()} {item.score}/100</Text>)}
          {activeCase && <View style={styles.opinionPanel}>
            <Text style={styles.opinionTitle}>НЕЗАВИСИМЫЕ ОЦЕНКИ</Text>
            <Text style={styles.opinionText}>Rules: {activeCase.evidence?.[0] ? `${activeCase.evidence[0].risk.toUpperCase()} ${activeCase.evidence[0].score}/100 по локальным признакам.` : 'Нет прикреплённых доказательств.'}</Text>
            <Text style={styles.opinionText}>AI: {messages.some((message) => message.role === 'assistant' && message.text && !message.text.startsWith('⚠')) ? `${ai.modelName} дал отдельный текстовый разбор.` : 'Ожидает отдельный ответ выбранной модели.'}</Text>
            <Text style={styles.opinionSub}>Расхождение не скрывается: rule-score и ответ AI проверяются отдельно, а финальное решение остаётся за человеком.</Text>
          </View>}
          {activeCase && <Text style={styles.caseTimeline}>Timeline: {activeCase.messages.length} сообщений · {new Date(activeCase.updatedAt).toLocaleString()}</Text>}
        </View>
      )}

      {showHistory && (
        <View style={styles.historyPanel}>
          <TextInput value={historySearch} onChangeText={setHistorySearch} placeholder="Поиск по диалогам" placeholderTextColor={colors.muted} style={styles.historySearch} />
          {sessions.filter((session) => session.title.toLowerCase().includes(historySearch.trim().toLowerCase())).length === 0
            ? <Text style={styles.historyEmpty}>Сохранённых диалогов пока нет.</Text>
            : sessions.filter((session) => session.title.toLowerCase().includes(historySearch.trim().toLowerCase())).map((session) => (
              <View key={session.id} style={styles.historyItem}>
                <TouchableOpacity style={styles.historyOpen} onPress={() => openSession(session)}>
                  <Text numberOfLines={1} style={styles.historyTitle}>{session.title}</Text>
                  <Text style={styles.historyMeta}>{new Date(session.updatedAt).toLocaleString()} · {session.messages.length} сообщений</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityLabel="Удалить диалог" onPress={() => deleteSession(session.id)} style={styles.historyDelete}><Text style={styles.historyDeleteText}>×</Text></TouchableOpacity>
              </View>
            ))}
        </View>
      )}

      {transcript.trim().length > 0 && (
        <View style={styles.contextBanner}>
          <Text style={styles.contextLabel}>КОНТЕКСТ: текущий транскрипт</Text>
          <Text style={styles.contextPreview} numberOfLines={2}>{transcript.slice(0, 120)}…</Text>
        </View>
      )}

      {attachmentText ? (
        <TouchableOpacity style={styles.attachment} onPress={() => setInputText(`Please analyse this shared text:\n${attachmentText.slice(0, 3_000)}`)}>
          <Text style={styles.attachmentTitle}>Shared text attachment</Text>
          <Text numberOfLines={3} style={styles.attachmentCopy}>{attachmentText}</Text>
        </TouchableOpacity>
      ) : null}

      {attachmentEvidence.map(({ attachment, evidence, indicators, quality, receipt }) => (
        <View key={`${attachment.fileName}-${attachment.uri ?? attachment.text.slice(0, 24)}`} style={styles.chatAttachment}>
          {attachment.kind === 'image' && attachment.uri ? <Image source={{ uri: attachment.uri }} style={styles.attachmentImage} /> : null}
          <View style={styles.chatAttachmentCopy}>
            <Text style={styles.chatAttachmentTitle}>{attachment.kind.toUpperCase()}: {attachment.fileName}</Text>
            <Text numberOfLines={2} style={styles.chatAttachmentText}>{quality.summary}</Text>
            <Text style={styles.attachmentEvidence}>Локальная проверка: {evidence.risk.toUpperCase()} {evidence.score}/100 · {evidence.scheme}</Text>
            {evidence.references.slice(0, 1).map((reference) => <Text key={reference.line} numberOfLines={1} style={styles.attachmentReference}>§{reference.line}: {reference.text}</Text>)}
            {(indicators.links.length > 0 || indicators.phones.length > 0 || indicators.codes.length > 0) && <Text numberOfLines={1} style={styles.attachmentIndicators}>Найдены: {indicators.links.length > 0 ? `${indicators.links.length} ссыл.` : ''}{indicators.phones.length > 0 ? ` ${indicators.phones.length} ном.` : ''}{indicators.codes.length > 0 ? ` ${indicators.codes.length} код.` : ''}</Text>}
            {(receipt.amounts.length > 0 || receipt.iban.length > 0 || receipt.dates.length > 0) && <Text numberOfLines={1} style={styles.attachmentIndicators}>Реквизиты: {receipt.amounts[0] ?? ''} {receipt.iban[0] ?? ''} {receipt.dates[0] ?? ''}</Text>}
            {indicators.links.slice(0, 1).map((link) => {
              const safety = inspectLinkOffline(link)
              return <Text key={link} numberOfLines={2} style={[styles.linkSafety, safety.risk === 'high' && styles.linkSafetyHigh]}>Ссылка {safety.host}: {safety.risk.toUpperCase()} · {safety.reasons[0]}</Text>
            })}
          </View>
          <TouchableOpacity accessibilityLabel="Удалить вложение" onPress={() => { setChatAttachments((items) => items.filter((item) => item !== attachment)); setCloudAttachmentConsent(false) }} style={styles.removeAttachmentButton}>
            <Text style={styles.removeAttachmentText}>×</Text>
          </TouchableOpacity>
        </View>
      ))}
      {documentComparison && (
        <View style={styles.comparisonPanel}>
          <TouchableOpacity onPress={() => setShowComparison((current) => !current)}><Text style={styles.comparisonTitle}>Сравнить первые два файла</Text></TouchableOpacity>
          {showComparison && <>
            <Text style={styles.comparisonSummary}>{documentComparison.summary}</Text>
            {documentComparison.changedIndicators.map((item) => <Text key={item} style={styles.comparisonDetail}>• {item}</Text>)}
            {documentComparison.additions.slice(0, 2).map((item) => <Text key={`+${item}`} numberOfLines={1} style={styles.comparisonDetail}>+ {item}</Text>)}
            {documentComparison.removals.slice(0, 2).map((item) => <Text key={`-${item}`} numberOfLines={1} style={styles.comparisonDetail}>− {item}</Text>)}
            <TouchableOpacity style={styles.comparisonAsk} onPress={() => setInputText('Сравни первые два вложения: перечисли изменения реквизитов, риска и существенных условий с ссылками на фрагменты §.')}><Text style={styles.comparisonAskText}>Спросить AI о различиях</Text></TouchableOpacity>
          </>}
        </View>
      )}
      {engine === 'cloud' && chatAttachments.length > 0 && (
        <TouchableOpacity style={[styles.privacyPanel, cloudAttachmentConsent && styles.privacyPanelAccepted]} onPress={() => setCloudAttachmentConsent((current) => !current)}>
          <Text style={styles.privacyTitle}>{cloudAttachmentConsent ? 'Облачная передача подтверждена' : 'Подтвердите передачу вложений в облачный AI'}</Text>
          <Text style={styles.privacyText}>Передаются только извлечённый текст и локально обезличенные данные. Обнаружено: {cloudPrivacySummary}</Text>
        </TouchableOpacity>
      )}
      {attachmentError && <Text style={styles.attachmentError}>{attachmentError}</Text>}

      <View style={styles.templateRow}>
        {CHAT_TEMPLATES.map((template) => <TouchableOpacity key={template} style={styles.templateChip} onPress={() => setInputText(template)} disabled={generating || ai.generating}><Text numberOfLines={2} style={styles.templateText}>{template}</Text></TouchableOpacity>)}
      </View>

      {messages.length === 0 && (
        <View style={styles.quickGrid}>
          {QUICK_QUESTIONS.map(q => (
            <TouchableOpacity key={q.id} style={styles.quickChip} onPress={() => sendQuick(q)} disabled={generating || ai.generating}>
              <Text style={styles.quickChipText}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.chatScroll}
        contentContainerStyle={styles.chatContent}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        onScroll={({ nativeEvent }) => {
          const distanceToBottom = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y
          isAtBottomRef.current = distanceToBottom < 32
        }}
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          if (isAtBottomRef.current) scrollRef.current?.scrollToEnd({ animated: false })
        }}
      >
        {messages.map((msg) => (
          <View key={msg.id} style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
            {msg.role === 'assistant' && (
              <Text style={styles.aiLabel}>VoiceShield AI{msg.streaming ? ' ●' : ''}</Text>
            )}
            <Text style={[styles.bubbleText, msg.role === 'user' && styles.userBubbleText]}>
              {msg.text || (msg.streaming ? '…' : '')}
            </Text>
            {msg.attachmentNames && msg.attachmentNames.length > 0 && <Text style={styles.messageAttachment}>Файлы: {msg.attachmentNames.join(', ')}</Text>}
            {msg.role === 'assistant' && msg.quality && (
              <View style={[styles.qualityRow, msg.quality.shouldReview && styles.qualityRowWarning]}>
                <Text style={styles.qualityScore}>KZ QUALITY {msg.quality.score}/100</Text>
                <Text style={styles.qualityText}>
                  {msg.quality.warnings.length > 0 ? msg.quality.warnings.join(' ') : 'Язык и критические факты сохранены.'}
                </Text>
              </View>
            )}
            {msg.role === 'assistant' && msg.text.includes('[AI reached the provider output limit.') && !generating && (
              <TouchableOpacity style={styles.continueButton} onPress={continueResponse}><Text style={styles.continueButtonText}>Продолжить ответ</Text></TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>

      {messages.length > 0 && !generating && !ai.generating && (
        <View style={styles.quickGridSmall}>
          {QUICK_QUESTIONS.slice(0, 3).map(q => (
            <TouchableOpacity key={q.id} style={styles.quickChipSmall} onPress={() => sendQuick(q)}>
              <Text style={styles.quickChipSmallText}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Спросите об этом звонке…"
          placeholderTextColor={colors.muted}
          multiline
          maxLength={500}
          editable={!generating && !ai.generating}
          onSubmitEditing={() => { void send(inputText) }}
        />
        <TouchableOpacity
          accessibilityLabel="Добавить файл, документ или изображение"
          style={[styles.attachButton, (generating || ai.generating) && styles.sendBtnDisabled]}
          onPress={() => { void attachFile() }}
          disabled={generating || ai.generating}
        >
          <Text style={styles.attachButtonText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel="Добавить аудио и расшифровать его"
          style={[styles.attachButton, (generating || ai.generating) && styles.sendBtnDisabled]}
          onPress={() => { void attachAudio() }}
          disabled={generating || ai.generating}
        >
          <Text style={styles.audioAttachmentText}>♪</Text>
        </TouchableOpacity>
        {generating
          ? <TouchableOpacity style={styles.stopBtn} onPress={stop}>
              <Text style={styles.stopBtnText}>■</Text>
            </TouchableOpacity>
          : <TouchableOpacity
              style={[styles.sendBtn, ((!inputText.trim() && chatAttachments.length === 0) || ai.generating) && styles.sendBtnDisabled]}
              onPress={() => { void send(inputText) }}
              disabled={(!inputText.trim() && chatAttachments.length === 0) || ai.generating}
            >
              <Text style={styles.sendBtnText}>→</Text>
            </TouchableOpacity>
        }
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 400 },
  setupContent: { paddingBottom: 24 },
  setupTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', marginBottom: 6 },
  engineRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  engineChip: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, flex: 1, padding: 9 },
  engineChipActive: { backgroundColor: colors.softBrand, borderColor: colors.brand },
  engineChipText: { color: colors.sub, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  engineChipTextActive: { color: colors.brandDark },
  switchModelButton: { alignSelf: 'flex-start', marginBottom: 9, paddingVertical: 4 },
  switchModelText: { color: colors.brandDark, fontSize: 10, fontWeight: '900', textDecorationLine: 'underline' },
  chatToolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 },
  toolbarButton: { backgroundColor: colors.chipBg, borderColor: colors.border, borderRadius: 7, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  toolbarButtonDisabled: { opacity: 0.4 },
  toolbarButtonText: { color: colors.brandDark, fontSize: 11, fontWeight: '800' },
  historyPanel: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, marginBottom: 10, padding: 10 },
  historySearch: { backgroundColor: colors.chipBg, borderColor: colors.border, borderRadius: 7, borderWidth: 1, color: colors.ink, fontSize: 12, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 8 },
  historyEmpty: { color: colors.sub, fontSize: 12, paddingVertical: 8 },
  historyItem: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 8, paddingVertical: 9 },
  historyOpen: { flex: 1 },
  historyTitle: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  historyMeta: { color: colors.muted, fontSize: 10, marginTop: 3 },
  historyDelete: { alignItems: 'center', borderColor: colors.border, borderRadius: 14, borderWidth: 1, height: 28, justifyContent: 'center', width: 28 },
  historyDeleteText: { color: '#b91c1c', fontSize: 20, fontWeight: '500', lineHeight: 21 },
  casePanel: { backgroundColor: '#f0fdf4', borderColor: '#86efac', borderRadius: 8, borderWidth: 1, marginBottom: 10, padding: 10 },
  casePanelTitle: { color: '#166534', fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginBottom: 4 },
  casePanelText: { color: '#166534', fontSize: 10, lineHeight: 15, marginBottom: 8 },
  noteRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 7, marginBottom: 8 },
  noteInput: { backgroundColor: '#fff', borderColor: '#86efac', borderRadius: 7, borderWidth: 1, color: colors.ink, flex: 1, fontSize: 11, maxHeight: 70, minHeight: 38, padding: 8 },
  noteSave: { backgroundColor: '#15803d', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 10 },
  noteSaveText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  caseNote: { color: '#14532d', fontSize: 11, lineHeight: 16, marginBottom: 3 },
  caseEvidence: { color: '#166534', fontSize: 10, lineHeight: 15, marginBottom: 2 },
  caseTimeline: { color: '#4b5563', fontSize: 10, marginTop: 6 },
  opinionPanel: { backgroundColor: '#fff', borderColor: '#bbf7d0', borderRadius: 7, borderWidth: 1, marginTop: 7, padding: 8 },
  opinionTitle: { color: '#166534', fontSize: 9, fontWeight: '900', letterSpacing: 0.6, marginBottom: 3 },
  opinionText: { color: '#14532d', fontSize: 10, lineHeight: 15 },
  opinionSub: { color: '#4b5563', fontSize: 9, lineHeight: 13, marginTop: 4 },
  setupText: { color: colors.sub, fontSize: 13, lineHeight: 20, marginBottom: 10 },
  cloudWarning: { backgroundColor: '#fff7ed', borderColor: '#fdba74', borderRadius: 8, borderWidth: 1, gap: 4, marginBottom: 10, padding: 11 },
  cloudWarningTitle: { color: '#9a3412', fontSize: 11, fontWeight: '900' },
  cloudWarningText: { color: '#7c2d12', fontSize: 10, lineHeight: 15 },
  cloudBudget: { color: '#7c2d12', fontSize: 10, lineHeight: 15, marginBottom: 9 },
  setupSteps: { backgroundColor: colors.chipBg, borderRadius: 8, color: colors.ink, fontSize: 12, lineHeight: 20, marginBottom: 12, padding: 10 },
  termsRow: { alignItems: 'center', flexDirection: 'row', gap: 9, marginBottom: 5 },
  checkbox: { alignItems: 'center', borderColor: colors.muted, borderRadius: 4, borderWidth: 1, height: 20, justifyContent: 'center', width: 20 },
  checkboxChecked: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkboxMark: { color: '#fff', fontSize: 14, fontWeight: '900' },
  termsText: { color: colors.ink, flex: 1, fontSize: 12, fontWeight: '700' },
  termsLink: { color: colors.brandDark, fontSize: 12, fontWeight: '800', marginBottom: 10, textDecorationLine: 'underline' },
  error: { backgroundColor: '#fee2e2', borderRadius: 6, color: '#991b1b', fontSize: 12, marginBottom: 8, padding: 8 },
  recoveryAdvice: { backgroundColor: '#fef3c7', borderRadius: 7, color: '#713f12', fontSize: 12, lineHeight: 18, marginBottom: 8, padding: 10 },
  loadBtn: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 13 },
  loadBtnDisabled: { opacity: 0.5 },
  loadBtnText: { color: '#fff', fontWeight: '800' },
  progressText: { color: colors.brandDark, fontSize: 12, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  importBtn: { alignItems: 'center', borderColor: colors.brand, borderRadius: 10, borderWidth: 1, marginTop: 8, paddingHorizontal: 20, paddingVertical: 12 },
  importBtnText: { color: colors.brandDark, fontWeight: '800' },
  contextBanner: { backgroundColor: colors.chipBg, borderRadius: 8, marginBottom: 10, padding: 10 },
  contextLabel: { color: colors.brandDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginBottom: 3 },
  contextPreview: { color: colors.sub, fontSize: 12, lineHeight: 17 },
  attachment: { backgroundColor: '#eff6ff', borderColor: '#93c5fd', borderRadius: 8, borderWidth: 1, gap: 4, marginBottom: 10, padding: 10 },
  attachmentTitle: { color: '#1d4ed8', fontSize: 12, fontWeight: '900' },
  attachmentCopy: { color: '#334155', fontSize: 12, lineHeight: 17 },
  chatAttachment: { alignItems: 'center', backgroundColor: '#eff6ff', borderColor: '#93c5fd', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 8, marginBottom: 8, padding: 10 },
  attachmentImage: { borderRadius: 5, height: 44, width: 44 },
  chatAttachmentCopy: { flex: 1 },
  chatAttachmentTitle: { color: '#1d4ed8', fontSize: 11, fontWeight: '900', marginBottom: 3 },
  chatAttachmentText: { color: '#334155', fontSize: 11, lineHeight: 15 },
  attachmentEvidence: { color: '#1d4ed8', fontSize: 10, fontWeight: '800', marginTop: 4 },
  attachmentReference: { color: '#475569', fontSize: 10, marginTop: 2 },
  attachmentIndicators: { color: '#9a3412', fontSize: 10, fontWeight: '800', marginTop: 3 },
  linkSafety: { color: '#475569', fontSize: 10, lineHeight: 14, marginTop: 3 },
  linkSafetyHigh: { color: '#b91c1c', fontWeight: '800' },
  removeAttachmentButton: { alignItems: 'center', borderColor: '#93c5fd', borderRadius: 16, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
  removeAttachmentText: { color: '#1d4ed8', fontSize: 22, fontWeight: '500', lineHeight: 24 },
  attachmentError: { color: '#991b1b', fontSize: 11, lineHeight: 16, marginBottom: 8 },
  privacyPanel: { backgroundColor: '#fff7ed', borderColor: '#fdba74', borderRadius: 8, borderWidth: 1, marginBottom: 8, padding: 10 },
  privacyPanelAccepted: { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' },
  privacyTitle: { color: '#9a3412', fontSize: 11, fontWeight: '900', marginBottom: 3 },
  privacyText: { color: '#7c2d12', fontSize: 10, lineHeight: 15 },
  comparisonPanel: { backgroundColor: '#f8fafc', borderColor: '#cbd5e1', borderRadius: 8, borderWidth: 1, marginBottom: 9, padding: 10 },
  comparisonTitle: { color: '#1e3a8a', fontSize: 11, fontWeight: '900' },
  comparisonSummary: { color: '#334155', fontSize: 11, lineHeight: 16, marginTop: 6 },
  comparisonDetail: { color: '#475569', fontSize: 10, lineHeight: 14, marginTop: 3 },
  comparisonAsk: { alignSelf: 'flex-start', borderColor: '#1d4ed8', borderRadius: 6, borderWidth: 1, marginTop: 8, paddingHorizontal: 8, paddingVertical: 6 },
  comparisonAskText: { color: '#1d4ed8', fontSize: 10, fontWeight: '900' },
  templateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  templateChip: { backgroundColor: colors.chipBg, borderColor: colors.border, borderRadius: 7, borderWidth: 1, flexBasis: '48%', padding: 8 },
  templateText: { color: colors.sub, fontSize: 10, fontWeight: '700', lineHeight: 14 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  quickChip: { backgroundColor: colors.softBrand, borderColor: colors.brand, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  quickChipText: { color: colors.brandDark, fontSize: 12, fontWeight: '700' },
  quickGridSmall: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8 },
  quickChipSmall: { backgroundColor: colors.chipBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  quickChipSmallText: { color: colors.sub, fontSize: 11, fontWeight: '700' },
  chatScroll: { height: 340, maxHeight: 340 },
  chatContent: { gap: 10, paddingBottom: 8 },
  bubble: { borderRadius: 12, maxWidth: '88%', padding: 12 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.brand },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
  bubbleText: { color: colors.ink, fontSize: 13, lineHeight: 20 },
  userBubbleText: { color: '#fff' },
  messageAttachment: { color: '#dbeafe', fontSize: 10, fontWeight: '800', marginTop: 7 },
  continueButton: { alignSelf: 'flex-start', borderColor: colors.brand, borderRadius: 6, borderWidth: 1, marginTop: 9, paddingHorizontal: 9, paddingVertical: 6 },
  continueButtonText: { color: colors.brandDark, fontSize: 10, fontWeight: '900' },
  aiLabel: { color: colors.brandDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginBottom: 4 },
  qualityRow: { backgroundColor: colors.chipBg, borderRadius: 6, marginTop: 9, padding: 8 },
  qualityRowWarning: { backgroundColor: '#fff7ed', borderColor: '#fdba74', borderWidth: 1 },
  qualityScore: { color: colors.brandDark, fontSize: 9, fontWeight: '900', marginBottom: 3 },
  qualityText: { color: colors.sub, fontSize: 10, lineHeight: 14 },
  inputRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 8, marginTop: 8 },
  input: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.ink, flex: 1, maxHeight: 90, minHeight: 44, padding: 10 },
  sendBtn: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: 10, height: 44, justifyContent: 'center', width: 44 },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  attachButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.brand, borderRadius: 10, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  attachButtonText: { color: colors.brandDark, fontSize: 25, fontWeight: '500', lineHeight: 28 },
  audioAttachmentText: { color: colors.brandDark, fontSize: 22, fontWeight: '700', lineHeight: 26 },
  stopBtn: { alignItems: 'center', backgroundColor: '#dc2626', borderRadius: 10, height: 44, justifyContent: 'center', width: 44 },
  stopBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },
})
