import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
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
import { buildPrompt, buildUserMessage, QUICK_QUESTIONS, SYSTEM_PROMPT } from '../utils/llmPrompts'
import { colors } from '../theme'
import { LocalModelCatalogView } from './LocalModelCatalogView'
import { CloudProviderCatalogView } from './CloudProviderCatalogView'
import { Card, SectionTitle } from './ui'
import type { AssistantEngine, OnDeviceAiRuntime } from '../hooks/useOnDeviceAiRuntime'
import { buildKazakhIntelligenceContext, validateKazakhResponse, type KazakhResponseQuality } from '../utils/kazakhIntelligence'
import { enhanceTranscript } from '../utils/transcriptEnhancer'
import { ChatFileModule, type ChatAttachment } from '../bridge/ChatFileBridge'
import type { CloudAttachment } from '../services/cloudAiClient'

type ChatMessage = { role: 'user' | 'assistant'; text: string; attachments?: ChatAttachment[]; streaming?: boolean; quality?: KazakhResponseQuality }

type Props = { transcript: string; languageContext?: string; modelBasePath?: string; ai: OnDeviceAiRuntime }
const GEMMA_TERMS_ACCEPTED_KEY = 'voiceshield.gemma.terms.v1'

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

export function LLMAssistantView({ transcript, languageContext = '', modelBasePath, ai }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
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
  const scrollRef = useRef<ScrollView>(null)
  const currentTokensRef = useRef('')
  const modelReady = ai.modelReady
  const engine = ai.engine
  const activeLocalModelId = ai.activeLocalModelId
  const modelBusy = loadingModel || ai.loading
  const visibleError = loadError ?? ai.runtimeError
  const modelKazakhContext = useMemo(
    () => buildKazakhIntelligenceContext(enhanceTranscript(transcript), ai.engine, ai.modelName),
    [ai.engine, ai.modelName, transcript],
  )

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

  const pickChatFile = useCallback(async () => {
    if (generating || ai.generating) return
    try {
      const file = await ChatFileModule.pickFile()
      if (file) setAttachments((current) => [...current, file].slice(-4))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Не удалось прикрепить файл.')
    }
  }, [ai.generating, generating])

  const send = useCallback(async (text: string, selectedAttachments = attachments) => {
    if ((!text.trim() && selectedAttachments.length === 0) || generating || ai.generating || !modelReady) return
    const attachmentLabel = selectedAttachments.length > 0
      ? `\nВложения: ${selectedAttachments.map((item) => item.name).join(', ')}`
      : ''
    const userMsg: ChatMessage = { role: 'user', text: `${text.trim()}${attachmentLabel}`.trim(), attachments: selectedAttachments }
    setMessages(prev => [...prev, userMsg, { role: 'assistant', text: '', streaming: true }])
    setInputText('')
    setAttachments([])
    setGenerating(true)
    currentTokensRef.current = ''
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
    try {
      const contextualQuestion = [
        text.trim() || 'Проанализируй прикреплённые файлы.',
        languageContext ? `Производный KSC2-языковой контекст (не доказательство): ${languageContext.slice(0, 700)}` : '',
        `Казахский semantic runtime: ${modelKazakhContext.slice(0, 1000)}`,
        '',
      ].filter(Boolean).join('\n\n')
      const attachmentText = selectedAttachments.map((item) => item.text || item.note ? `Вложение ${item.name}:\n${item.text || item.note}` : `Вложение ${item.name}: изображение прикреплено для vision-модели.`).join('\n\n')
      const questionWithFiles = `${contextualQuestion}\n\n${attachmentText}`.trim()
      const userMessage = buildUserMessage(`${questionWithFiles}\n\n`, transcript)
      const fullPrompt = buildPrompt(SYSTEM_PROMPT, `${questionWithFiles}\n\n`, transcript)
      const cloudAttachments: CloudAttachment[] = selectedAttachments.map(({ name, mimeType, text, base64, note }) => ({ name, mimeType, text, base64, note }))
      const full = await ai.generate({
        owner: 'assistant',
        gemmaPrompt: fullPrompt,
        localSystemPrompt: SYSTEM_PROMPT,
        localUserMessage: userMessage,
        attachments: cloudAttachments,
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
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', text: full, streaming: false, quality }])
      setGenerating(false)
      currentTokensRef.current = ''
    } catch (e: any) {
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.streaming) return [...prev.slice(0, -1), { role: 'assistant', text: `⚠ ${e?.message ?? 'Error'}`, streaming: false }]
        return prev
      })
      setGenerating(false)
    }
  }, [ai, attachments, generating, languageContext, modelKazakhContext, modelReady, transcript])

  const sendQuick = useCallback((q: (typeof QUICK_QUESTIONS)[number]) => {
    void send(q.prompt)
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
          <TouchableOpacity style={styles.switchModelButton} onPress={() => setShowCloudCatalog(true)} disabled={generating || ai.generating}><Text style={styles.switchModelText}>Сменить API-модель</Text></TouchableOpacity>
        </>
      )}

      {transcript.trim().length > 0 && (
        <View style={styles.contextBanner}>
          <Text style={styles.contextLabel}>КОНТЕКСТ: текущий транскрипт</Text>
          <Text style={styles.contextPreview} numberOfLines={2}>{transcript.slice(0, 120)}…</Text>
        </View>
      )}

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
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {messages.map((msg, idx) => (
          <View key={idx} style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
            {msg.role === 'assistant' && (
              <Text style={styles.aiLabel}>VoiceShield AI{msg.streaming ? ' ●' : ''}</Text>
            )}
            {msg.attachments?.map((item) => <Text key={`${idx}-${item.name}`} style={styles.attachmentLabel}>📎 {item.name}</Text>)}
            <Text style={[styles.bubbleText, msg.role === 'user' && styles.userBubbleText]}>
              {msg.text || (msg.streaming ? '…' : '')}
            </Text>
            {msg.role === 'assistant' && msg.quality && (
              <View style={[styles.qualityRow, msg.quality.shouldReview && styles.qualityRowWarning]}>
                <Text style={styles.qualityScore}>KZ QUALITY {msg.quality.score}/100</Text>
                <Text style={styles.qualityText}>
                  {msg.quality.warnings.length > 0 ? msg.quality.warnings.join(' ') : 'Язык и критические факты сохранены.'}
                </Text>
              </View>
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

      {attachments.length > 0 && (
        <View style={styles.attachmentRow}>
          {attachments.map((item) => (
            <TouchableOpacity key={item.name} style={styles.attachmentChip} onPress={() => setAttachments((current) => current.filter((file) => file !== item))}>
              <Text numberOfLines={1} style={styles.attachmentChipText}>📎 {item.name} ×</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.attachBtn} onPress={() => { void pickChatFile() }} disabled={generating || ai.generating}>
          <Text style={styles.attachBtnText}>＋</Text>
        </TouchableOpacity>
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
        {generating
          ? <TouchableOpacity style={styles.stopBtn} onPress={stop}>
              <Text style={styles.stopBtnText}>■</Text>
            </TouchableOpacity>
          : <TouchableOpacity
              style={[styles.sendBtn, (!inputText.trim() && attachments.length === 0 || ai.generating) && styles.sendBtnDisabled]}
              onPress={() => { void send(inputText) }}
              disabled={(!inputText.trim() && attachments.length === 0) || ai.generating}
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
  setupText: { color: colors.sub, fontSize: 13, lineHeight: 20, marginBottom: 10 },
  cloudWarning: { backgroundColor: '#fff7ed', borderColor: '#fdba74', borderRadius: 8, borderWidth: 1, gap: 4, marginBottom: 10, padding: 11 },
  cloudWarningTitle: { color: '#9a3412', fontSize: 11, fontWeight: '900' },
  cloudWarningText: { color: '#7c2d12', fontSize: 10, lineHeight: 15 },
  setupSteps: { backgroundColor: colors.chipBg, borderRadius: 8, color: colors.ink, fontSize: 12, lineHeight: 20, marginBottom: 12, padding: 10 },
  termsRow: { alignItems: 'center', flexDirection: 'row', gap: 9, marginBottom: 5 },
  checkbox: { alignItems: 'center', borderColor: colors.muted, borderRadius: 4, borderWidth: 1, height: 20, justifyContent: 'center', width: 20 },
  checkboxChecked: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkboxMark: { color: '#fff', fontSize: 14, fontWeight: '900' },
  termsText: { color: colors.ink, flex: 1, fontSize: 12, fontWeight: '700' },
  termsLink: { color: colors.brandDark, fontSize: 12, fontWeight: '800', marginBottom: 10, textDecorationLine: 'underline' },
  error: { backgroundColor: '#fee2e2', borderRadius: 6, color: '#991b1b', fontSize: 12, marginBottom: 8, padding: 8 },
  loadBtn: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 13 },
  loadBtnDisabled: { opacity: 0.5 },
  loadBtnText: { color: '#fff', fontWeight: '800' },
  progressText: { color: colors.brandDark, fontSize: 12, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  importBtn: { alignItems: 'center', borderColor: colors.brand, borderRadius: 10, borderWidth: 1, marginTop: 8, paddingHorizontal: 20, paddingVertical: 12 },
  importBtnText: { color: colors.brandDark, fontWeight: '800' },
  contextBanner: { backgroundColor: colors.chipBg, borderRadius: 8, marginBottom: 10, padding: 10 },
  contextLabel: { color: colors.brandDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginBottom: 3 },
  contextPreview: { color: colors.sub, fontSize: 12, lineHeight: 17 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  quickChip: { backgroundColor: colors.softBrand, borderColor: colors.brand, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  quickChipText: { color: colors.brandDark, fontSize: 12, fontWeight: '700' },
  quickGridSmall: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8 },
  quickChipSmall: { backgroundColor: colors.chipBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  quickChipSmallText: { color: colors.sub, fontSize: 11, fontWeight: '700' },
  chatScroll: { flex: 1, maxHeight: 380 },
  chatContent: { gap: 10, paddingBottom: 8 },
  bubble: { borderRadius: 12, maxWidth: '88%', padding: 12 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.brand },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
  bubbleText: { color: colors.ink, fontSize: 13, lineHeight: 20 },
  userBubbleText: { color: '#fff' },
  aiLabel: { color: colors.brandDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginBottom: 4 },
  qualityRow: { backgroundColor: colors.chipBg, borderRadius: 6, marginTop: 9, padding: 8 },
  qualityRowWarning: { backgroundColor: '#fff7ed', borderColor: '#fdba74', borderWidth: 1 },
  qualityScore: { color: colors.brandDark, fontSize: 9, fontWeight: '900', marginBottom: 3 },
  qualityText: { color: colors.sub, fontSize: 10, lineHeight: 14 },
  inputRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 8, marginTop: 8 },
  attachmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  attachmentChip: { backgroundColor: colors.softBrand, borderColor: colors.brand, borderRadius: 7, borderWidth: 1, maxWidth: '90%', paddingHorizontal: 9, paddingVertical: 6 },
  attachmentChipText: { color: colors.brandDark, fontSize: 10, fontWeight: '800' },
  attachmentLabel: { color: colors.brandDark, fontSize: 10, fontWeight: '800', marginBottom: 5 },
  attachBtn: { alignItems: 'center', backgroundColor: colors.chipBg, borderColor: colors.border, borderRadius: 10, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  attachBtnText: { color: colors.brandDark, fontSize: 24, fontWeight: '700' },
  input: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.ink, flex: 1, maxHeight: 90, minHeight: 44, padding: 10 },
  sendBtn: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: 10, height: 44, justifyContent: 'center', width: 44 },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  stopBtn: { alignItems: 'center', backgroundColor: '#dc2626', borderRadius: 10, height: 44, justifyContent: 'center', width: 44 },
  stopBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },
})
