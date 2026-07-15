import React, { useCallback, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import {
  llmEvents, LLMModule, GEMMA_MODEL_BYTES, GEMMA_MODEL_FILE, GEMMA_MODEL_SHA256,
  GEMMA_CONTEXT_TOKENS, GEMMA_MODEL_SIZE_MB, GEMMA_MODEL_URL, GEMMA_TERMS_URL,
} from '../bridge/LLMBridge'
import { modelEvents, ModelDownloader } from '../bridge/WhisperBridge'
import {
  generateLocalResponse, LEGACY_GGUF_MODEL_FILE, LOCAL_IMPORTED_MODEL_FILE,
  LOCAL_MODELS_STORAGE_KEY, loadLocalGgufModel, parseInstalledLocalModels,
  type InstalledLocalModel,
} from '../bridge/LocalLlmBridge'
import type { GgufVariant, PublicGgufModel } from '../data/huggingFaceCatalog'
import type { ModelStorageInfo } from '../data/whisperModels'
import { buildPrompt, buildUserMessage, QUICK_QUESTIONS, SYSTEM_PROMPT } from '../utils/llmPrompts'
import { colors } from '../theme'
import { LocalModelCatalogView } from './LocalModelCatalogView'
import { Card, SectionTitle } from './ui'

type ChatMessage = { role: 'user' | 'assistant'; text: string; streaming?: boolean }
type AssistantEngine = 'gemma' | 'local'

type Props = { transcript: string; modelBasePath?: string }
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

export function LLMAssistantView({ transcript, modelBasePath }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const [loadingModel, setLoadingModel] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [modelPath, setModelPath] = useState<string | null>(modelBasePath ?? null)
  const [installedModels, setInstalledModels] = useState<InstalledLocalModel[]>([])
  const [activeLocalModelId, setActiveLocalModelId] = useState<string | null>(null)
  const [downloadingVariantId, setDownloadingVariantId] = useState<string | null>(null)
  const [storageInfo, setStorageInfo] = useState<ModelStorageInfo>({ availableBytes: 0, totalBytes: 0, ramBytes: 0 })
  const [engine, setEngine] = useState<AssistantEngine>('gemma')
  const localContext = useRef<Awaited<ReturnType<typeof loadLocalGgufModel>> | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const scrollRef = useRef<ScrollView>(null)
  const currentTokensRef = useRef('')

  useEffect(() => {
    void LLMModule?.isReady().then(setModelReady).catch(() => setModelReady(false))
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

  useEffect(() => () => { void localContext.current?.release() }, [])

  useEffect(() => {
    const progressSub = modelEvents.addListener('VS_MODEL_DOWNLOAD_PROGRESS', (payload: { progress?: number }) => {
      setDownloadProgress(payload.progress ?? null)
    })
    return () => progressSub.remove()
  }, [])

  // Streaming token listener
  useEffect(() => {
    if (!llmEvents) return
    const tokenSub = llmEvents.addListener('VS_LLM_TOKEN', (token: string) => {
      currentTokensRef.current += token
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (!last || last.role !== 'assistant' || !last.streaming) return prev
        return [...prev.slice(0, -1), { ...last, text: currentTokensRef.current }]
      })
    })
    const doneSub = llmEvents.addListener('VS_LLM_DONE', (full: string) => {
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (!last || last.role !== 'assistant') return prev
        return [...prev.slice(0, -1), { role: 'assistant', text: full, streaming: false }]
      })
      setGenerating(false)
      currentTokensRef.current = ''
    })
    const errSub = llmEvents.addListener('VS_LLM_ERROR', (msg: string) => {
      setMessages(prev => [...prev, { role: 'assistant', text: `⚠ ${msg}` }])
      setGenerating(false)
      currentTokensRef.current = ''
    })
    const stoppedSub = llmEvents.addListener('VS_LLM_STOPPED', (msg: string) => {
      setModelReady(false)
      setLoadingModel(false)
      setGenerating(false)
      setLoadError(msg)
      currentTokensRef.current = ''
    })
    return () => { tokenSub.remove(); doneSub.remove(); errSub.remove(); stoppedSub.remove() }
  }, [])

  const loadModel = useCallback(async () => {
    if (!LLMModule) { setLoadError('LLM module not available on this build'); return }
    setLoadingModel(true)
    setLoadError(null)
    try {
      const path = modelPath ?? (modelBasePath ? `${modelBasePath}${modelBasePath.endsWith('/') ? '' : '/'}${GEMMA_MODEL_FILE}` : null)
      if (!path) throw new Error('Download Gemma first, then import the .task file from Downloads.')
      await LLMModule.loadModel(path, GEMMA_CONTEXT_TOKENS)
      setModelReady(true)
    } catch (e: any) {
      setLoadError(e?.message ?? 'Failed to load model')
    } finally {
      setLoadingModel(false)
    }
  }, [modelBasePath, modelPath])

  const importModel = useCallback(async () => {
    setLoadingModel(true)
    setLoadError(null)
    try {
      const path = await ModelDownloader.importGemmaModel()
      setModelPath(path)
      if (!LLMModule) throw new Error('LLM module not available on this build')
      await LLMModule.loadModel(path, GEMMA_CONTEXT_TOKENS)
      setModelReady(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not import the Gemma model'
      if (!message.includes('MODEL_IMPORT_CANCELLED')) setLoadError(message)
    } finally {
      setLoadingModel(false)
    }
  }, [])

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
    await LLMModule?.unloadModel().catch(() => undefined)
    await localContext.current?.release()
    localContext.current = null
    setActiveLocalModelId(null)
    setModelReady(false)
    const context = await loadLocalGgufModel(path)
    localContext.current = context
    setActiveLocalModelId(model.id)
    setEngine('local')
    setModelReady(true)
  }, [])

  const loadLocalModel = useCallback(async (model: InstalledLocalModel) => {
    if (activeLocalModelId === model.id && localContext.current) {
      setEngine('local')
      setModelReady(true)
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
  }, [activeLocalModelId, startLocalModel])

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
        await localContext.current?.release()
        localContext.current = null
        setActiveLocalModelId(null)
        setModelReady(false)
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
  }, [activeLocalModelId, installedModels, persistInstalledModels, refreshStorage])

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
      if (!LLMModule) throw new Error('LLM module not available on this build')
      await LLMModule.loadModel(path, GEMMA_CONTEXT_TOKENS)
      setModelReady(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось скачать модель Gemma'
      setLoadError(message)
    } finally {
      setLoadingModel(false)
      setDownloadProgress(null)
    }
  }, [termsAccepted])

  const acceptTerms = useCallback(async () => {
    const nextValue = !termsAccepted
    setTermsAccepted(nextValue)
    await AsyncStorage.setItem(GEMMA_TERMS_ACCEPTED_KEY, nextValue ? 'accepted' : 'declined')
  }, [termsAccepted])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || generating || !modelReady) return
    const userMsg: ChatMessage = { role: 'user', text: text.trim() }
    setMessages(prev => [...prev, userMsg, { role: 'assistant', text: '', streaming: true }])
    setInputText('')
    setGenerating(true)
    currentTokensRef.current = ''
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
    try {
      if (engine === 'local') {
        const context = localContext.current
        if (!context) throw new Error('GGUF-модель не загружена')
        const userMessage = buildUserMessage(text.trim() + '\n\n', transcript)
        const full = await generateLocalResponse(context, SYSTEM_PROMPT, userMessage, (token) => {
          currentTokensRef.current += token
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (!last || last.role !== 'assistant' || !last.streaming) return prev
            return [...prev.slice(0, -1), { ...last, text: currentTokensRef.current }]
          })
        })
        setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', text: full, streaming: false }])
        setGenerating(false)
        currentTokensRef.current = ''
      } else {
        const fullPrompt = buildPrompt(SYSTEM_PROMPT, text.trim() + '\n\n', transcript)
        await LLMModule!.generateResponse(fullPrompt)
      }
    } catch (e: any) {
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.streaming) return [...prev.slice(0, -1), { role: 'assistant', text: `⚠ ${e?.message ?? 'Error'}` }]
        return prev
      })
      setGenerating(false)
    }
  }, [engine, generating, modelReady, transcript])

  const sendQuick = useCallback((q: (typeof QUICK_QUESTIONS)[number]) => {
    void send(q.prompt)
  }, [send])

  const stop = useCallback(() => {
    if (engine === 'local') void localContext.current?.stopCompletion()
    else void LLMModule?.cancelGeneration()
    setGenerating(false)
  }, [engine])

  const selectEngine = useCallback(async (next: AssistantEngine) => {
    setLoadError(null)
    if (next === 'gemma') {
      await localContext.current?.release()
      localContext.current = null
      setActiveLocalModelId(null)
      setEngine('gemma')
      setModelReady(false)
      await loadModel()
      return
    }
    setEngine('local')
    setModelReady(Boolean(activeLocalModelId && localContext.current))
  }, [activeLocalModelId, loadModel])

  if (!modelReady) {
    return (
      <View style={styles.root}>
        <SectionTitle>VoiceShield AI</SectionTitle>
        <View style={styles.engineRow}>
          <TouchableOpacity style={[styles.engineChip, engine === 'gemma' && styles.engineChipActive]} onPress={() => { void selectEngine('gemma') }}>
            <Text style={[styles.engineChipText, engine === 'gemma' && styles.engineChipTextActive]}>Gemma</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.engineChip, engine === 'local' && styles.engineChipActive]} onPress={() => { void selectEngine('local') }}>
            <Text style={[styles.engineChipText, engine === 'local' && styles.engineChipTextActive]}>Каталог моделей</Text>
          </TouchableOpacity>
        </View>
        {engine === 'local' ? (
          <LocalModelCatalogView
            installedModels={installedModels}
            activeModelId={activeLocalModelId}
            availableBytes={storageInfo.availableBytes}
            ramBytes={storageInfo.ramBytes}
            busy={loadingModel}
            downloadingVariantId={downloadingVariantId}
            downloadProgress={downloadProgress}
            error={loadError}
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
          <TouchableOpacity style={styles.termsRow} onPress={() => { void acceptTerms() }} disabled={loadingModel}>
            <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
              {termsAccepted && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <Text style={styles.termsText}>Я принимаю условия использования Gemma</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { void Linking.openURL(GEMMA_TERMS_URL) }} disabled={loadingModel}>
            <Text style={styles.termsLink}>Открыть условия Gemma</Text>
          </TouchableOpacity>
          {loadError && <Text style={styles.error}>{loadError}</Text>}
          {loadError && (
            <TouchableOpacity
              style={styles.importBtn}
              onPress={() => {
                void LLMModule?.unloadModel().catch(() => undefined)
                setEngine('local')
                setLoadError(null)
              }}
              disabled={loadingModel}
            >
              <Text style={styles.importBtnText}>Открыть стабильный каталог GGUF</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.loadBtn, loadingModel && styles.loadBtnDisabled]}
            onPress={modelPath ? loadModel : downloadModel}
            disabled={loadingModel}
          >
            {loadingModel
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.loadBtnText}>{modelPath ? 'Запустить AI assistant' : `Скачать AI assistant (${GEMMA_MODEL_SIZE_MB} МБ)`}</Text>}
          </TouchableOpacity>
          {downloadProgress !== null && <Text style={styles.progressText}>Загрузка: {downloadProgress}%</Text>}
          <TouchableOpacity style={[styles.importBtn, loadingModel && styles.loadBtnDisabled]} onPress={importModel} disabled={loadingModel}>
            <Text style={styles.importBtnText}>Уже скачан файл? Импортировать</Text>
          </TouchableOpacity>
          </Card>
        )}
      </View>
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
          <Text style={[styles.engineChipText, engine === 'local' && styles.engineChipTextActive]}>Каталог моделей</Text>
        </TouchableOpacity>
      </View>

      {engine === 'local' && (
        <TouchableOpacity style={styles.switchModelButton} onPress={() => setModelReady(false)} disabled={generating}>
          <Text style={styles.switchModelText}>Сменить локальную модель</Text>
        </TouchableOpacity>
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
            <TouchableOpacity key={q.id} style={styles.quickChip} onPress={() => sendQuick(q)} disabled={generating}>
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
            <Text style={[styles.bubbleText, msg.role === 'user' && styles.userBubbleText]}>
              {msg.text || (msg.streaming ? '…' : '')}
            </Text>
          </View>
        ))}
      </ScrollView>

      {messages.length > 0 && !generating && (
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
          editable={!generating}
          onSubmitEditing={() => { void send(inputText) }}
        />
        {generating
          ? <TouchableOpacity style={styles.stopBtn} onPress={stop}>
              <Text style={styles.stopBtnText}>■</Text>
            </TouchableOpacity>
          : <TouchableOpacity
              style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
              onPress={() => { void send(inputText) }}
              disabled={!inputText.trim()}
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
  setupTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', marginBottom: 6 },
  engineRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  engineChip: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, flex: 1, padding: 9 },
  engineChipActive: { backgroundColor: colors.softBrand, borderColor: colors.brand },
  engineChipText: { color: colors.sub, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  engineChipTextActive: { color: colors.brandDark },
  switchModelButton: { alignSelf: 'flex-start', marginBottom: 9, paddingVertical: 4 },
  switchModelText: { color: colors.brandDark, fontSize: 10, fontWeight: '900', textDecorationLine: 'underline' },
  setupText: { color: colors.sub, fontSize: 13, lineHeight: 20, marginBottom: 10 },
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
  inputRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 8, marginTop: 8 },
  input: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.ink, flex: 1, maxHeight: 90, minHeight: 44, padding: 10 },
  sendBtn: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: 10, height: 44, justifyContent: 'center', width: 44 },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  stopBtn: { alignItems: 'center', backgroundColor: '#dc2626', borderRadius: 10, height: 44, justifyContent: 'center', width: 44 },
  stopBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },
})
