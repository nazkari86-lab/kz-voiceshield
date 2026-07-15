import { useCallback, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  GEMMA_CONTEXT_TOKENS,
  GEMMA_MODEL_BYTES,
  GEMMA_MODEL_FILE,
  GEMMA_MODEL_SHA256,
  llmEvents,
  LLMModule,
} from '../bridge/LLMBridge'
import {
  generateLocalResponse,
  loadLocalGgufModel,
  LOCAL_MODELS_STORAGE_KEY,
  parseInstalledLocalModels,
  type InstalledLocalModel,
} from '../bridge/LocalLlmBridge'
import { ModelDownloader } from '../bridge/WhisperBridge'
import {
  cloudProviderById,
  isCloudModelConfig,
  type CloudModelConfig,
  type CloudProviderId,
} from '../data/cloudAiProviders'
import { generateCloudResponse, hasProviderApiKey } from '../services/cloudAiClient'

export type AssistantEngine = 'gemma' | 'local' | 'cloud'
export type AiGenerationOwner = 'assistant' | 'live'

export type AiGenerationRequest = {
  owner: AiGenerationOwner
  gemmaPrompt: string
  localSystemPrompt: string
  localUserMessage: string
  onToken?: (token: string) => void
}

export const ACTIVE_AI_ENGINE_KEY = 'voiceshield.ai.engine.v1'
export const ACTIVE_LOCAL_MODEL_KEY = 'voiceshield.ai.local-model.v1'
export const ACTIVE_CLOUD_MODEL_KEY = 'voiceshield.ai.cloud-model.v1'

const GEMMA_TITLE = 'Gemma 3 1B'

export function useOnDeviceAiRuntime() {
  const [engine, setEngine] = useState<AssistantEngine>('gemma')
  const [modelReady, setModelReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generationOwner, setGenerationOwner] = useState<AiGenerationOwner | null>(null)
  const [activeLocalModelId, setActiveLocalModelId] = useState<string | null>(null)
  const [activeCloudConfig, setActiveCloudConfig] = useState<CloudModelConfig | null>(null)
  const [modelName, setModelName] = useState(GEMMA_TITLE)
  const [modelSize, setModelSize] = useState(GEMMA_MODEL_BYTES)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  const engineRef = useRef<AssistantEngine>('gemma')
  const readyRef = useRef(false)
  const generatingRef = useRef(false)
  const generationOwnerRef = useRef<AiGenerationOwner | null>(null)
  const generationIdRef = useRef(0)
  const tokenSinkRef = useRef<((token: string) => void) | null>(null)
  const activeLocalModelRef = useRef<InstalledLocalModel | null>(null)
  const activeCloudConfigRef = useRef<CloudModelConfig | null>(null)
  const cloudAbortRef = useRef<AbortController | null>(null)
  const localContext = useRef<Awaited<ReturnType<typeof loadLocalGgufModel>> | null>(null)
  const ensurePromiseRef = useRef<Promise<void> | null>(null)

  const updateReady = useCallback((ready: boolean) => {
    readyRef.current = ready
    setModelReady(ready)
  }, [])

  const updateEngine = useCallback((next: AssistantEngine) => {
    engineRef.current = next
    setEngine(next)
  }, [])

  const releaseLocalContext = useCallback(async () => {
    const context = localContext.current
    localContext.current = null
    if (context) await context.release().catch(() => undefined)
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      const [storedEngine, storedLocalId, storedCloudRaw, rawModels, gemmaPath, nativeGemmaReady] = await Promise.all([
        AsyncStorage.getItem(ACTIVE_AI_ENGINE_KEY),
        AsyncStorage.getItem(ACTIVE_LOCAL_MODEL_KEY),
        AsyncStorage.getItem(ACTIVE_CLOUD_MODEL_KEY),
        AsyncStorage.getItem(LOCAL_MODELS_STORAGE_KEY),
        ModelDownloader.getVerifiedModelPath(GEMMA_MODEL_FILE, GEMMA_MODEL_SHA256, GEMMA_MODEL_BYTES).catch(() => null),
        LLMModule?.isReady().catch(() => false) ?? Promise.resolve(false),
      ])
      if (!active) return
      const models = parseInstalledLocalModels(rawModels)
      const selectedLocal = models.find((model) => model.id === storedLocalId) ?? models[0] ?? null
      let selectedCloud: CloudModelConfig | null = null
      try {
        const parsed: unknown = storedCloudRaw ? JSON.parse(storedCloudRaw) : null
        if (isCloudModelConfig(parsed)) selectedCloud = parsed
      } catch {
        selectedCloud = null
      }
      const preferred: AssistantEngine = storedEngine === 'cloud' && selectedCloud
        ? 'cloud'
        : storedEngine === 'gemma' || storedEngine === 'local'
          ? storedEngine
          : gemmaPath || nativeGemmaReady || !selectedLocal ? 'gemma' : 'local'

      activeLocalModelRef.current = selectedLocal
      activeCloudConfigRef.current = selectedCloud
      setActiveLocalModelId(selectedLocal?.id ?? null)
      setActiveCloudConfig(selectedCloud)
      updateEngine(preferred)
      if (preferred === 'cloud' && selectedCloud) {
        const provider = cloudProviderById[selectedCloud.providerId]
        setModelName(`${provider.title} · ${selectedCloud.modelName}`)
        setModelSize(0)
        updateReady(await hasProviderApiKey(selectedCloud.providerId))
      } else if (preferred === 'local' && selectedLocal) {
        setModelName(selectedLocal.title)
        setModelSize(selectedLocal.size)
        if (!storedLocalId) await AsyncStorage.setItem(ACTIVE_LOCAL_MODEL_KEY, selectedLocal.id)
      } else {
        setModelName(GEMMA_TITLE)
        setModelSize(GEMMA_MODEL_BYTES)
      }
      if (preferred !== 'cloud') updateReady(preferred === 'gemma' && Boolean(nativeGemmaReady))
      await AsyncStorage.setItem(ACTIVE_AI_ENGINE_KEY, preferred)
      if (active) setHydrated(true)
    })().catch((error) => {
      if (!active) return
      setRuntimeError(error instanceof Error ? error.message : 'Не удалось восстановить выбранную AI-модель.')
      setHydrated(true)
    })
    return () => { active = false }
  }, [updateEngine, updateReady])

  useEffect(() => {
    if (!llmEvents) return undefined
    const tokenSub = llmEvents.addListener('VS_LLM_TOKEN', (token: string) => {
      if (token) tokenSinkRef.current?.(token)
    })
    const stoppedSub = llmEvents.addListener('VS_LLM_STOPPED', (message: string) => {
      if (engineRef.current === 'gemma') {
        updateReady(false)
        setRuntimeError(message)
      }
    })
    return () => {
      tokenSub.remove()
      stoppedSub.remove()
    }
  }, [updateReady])

  const stopGeneration = useCallback(async (owner?: AiGenerationOwner) => {
    if (!generatingRef.current) return
    if (owner && generationOwnerRef.current !== owner) return
    if (engineRef.current === 'cloud') cloudAbortRef.current?.abort()
    else if (engineRef.current === 'local') await localContext.current?.stopCompletion().catch(() => undefined)
    else await LLMModule?.cancelGeneration().catch(() => undefined)
    for (let attempt = 0; attempt < 40 && generatingRef.current; attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 25))
    }
  }, [])

  const loadGemma = useCallback(async (path: string) => {
    if (!LLMModule) throw new Error('Gemma недоступна в этой сборке.')
    setLoading(true)
    setRuntimeError(null)
    try {
      await stopGeneration()
      await releaseLocalContext()
      const alreadyReady = await LLMModule.isReady().catch(() => false)
      if (!alreadyReady) await LLMModule.loadModel(path, GEMMA_CONTEXT_TOKENS)
      updateEngine('gemma')
      setModelName(GEMMA_TITLE)
      setModelSize(GEMMA_MODEL_BYTES)
      updateReady(true)
      await AsyncStorage.setItem(ACTIVE_AI_ENGINE_KEY, 'gemma')
    } catch (error) {
      updateReady(false)
      const message = error instanceof Error ? error.message : 'Не удалось запустить Gemma.'
      setRuntimeError(message)
      throw error
    } finally {
      setLoading(false)
    }
  }, [releaseLocalContext, stopGeneration, updateEngine, updateReady])

  const loadLocalModel = useCallback(async (model: InstalledLocalModel, knownPath?: string) => {
    setLoading(true)
    setRuntimeError(null)
    try {
      await stopGeneration()
      const path = knownPath ?? (model.sha256
        ? await ModelDownloader.getVerifiedModelPath(model.fileName, model.sha256, model.size)
        : await ModelDownloader.getModelPath(model.fileName))
      if (!path) throw new Error('Файл выбранной GGUF-модели не найден.')
      const gemmaReady = await LLMModule?.isReady().catch(() => false)
      if (gemmaReady) await LLMModule?.unloadModel().catch(() => undefined)
      await releaseLocalContext()
      const context = await loadLocalGgufModel(path)
      localContext.current = context
      activeLocalModelRef.current = model
      setActiveLocalModelId(model.id)
      setModelName(model.title)
      setModelSize(model.size)
      updateEngine('local')
      updateReady(true)
      await Promise.all([
        AsyncStorage.setItem(ACTIVE_AI_ENGINE_KEY, 'local'),
        AsyncStorage.setItem(ACTIVE_LOCAL_MODEL_KEY, model.id),
      ])
    } catch (error) {
      updateReady(false)
      const message = error instanceof Error ? error.message : 'Не удалось запустить GGUF-модель.'
      setRuntimeError(message)
      throw error
    } finally {
      setLoading(false)
    }
  }, [releaseLocalContext, stopGeneration, updateEngine, updateReady])

  const loadCloudModel = useCallback(async (config: CloudModelConfig) => {
    setLoading(true)
    setRuntimeError(null)
    try {
      if (!await hasProviderApiKey(config.providerId)) {
        throw new Error(`Сначала сохраните API-ключ ${cloudProviderById[config.providerId].title}.`)
      }
      await stopGeneration()
      await releaseLocalContext()
      const gemmaReady = await LLMModule?.isReady().catch(() => false)
      if (gemmaReady) await LLMModule?.unloadModel().catch(() => undefined)
      activeCloudConfigRef.current = config
      setActiveCloudConfig(config)
      setModelName(`${cloudProviderById[config.providerId].title} · ${config.modelName}`)
      setModelSize(0)
      updateEngine('cloud')
      updateReady(true)
      await Promise.all([
        AsyncStorage.setItem(ACTIVE_AI_ENGINE_KEY, 'cloud'),
        AsyncStorage.setItem(ACTIVE_CLOUD_MODEL_KEY, JSON.stringify(config)),
      ])
    } catch (error) {
      updateReady(false)
      const message = error instanceof Error ? error.message : 'Не удалось подключить API-модель.'
      setRuntimeError(message)
      throw error
    } finally {
      setLoading(false)
    }
  }, [releaseLocalContext, stopGeneration, updateEngine, updateReady])

  const selectEngine = useCallback(async (next: AssistantEngine) => {
    if (engineRef.current === next) return
    await stopGeneration()
    if (next === 'local') {
      const gemmaReady = await LLMModule?.isReady().catch(() => false)
      if (gemmaReady) await LLMModule?.unloadModel().catch(() => undefined)
      const selected = activeLocalModelRef.current
      setModelName(selected?.title ?? 'Локальная GGUF-модель')
      setModelSize(selected?.size ?? 0)
    } else if (next === 'cloud') {
      const gemmaReady = await LLMModule?.isReady().catch(() => false)
      if (gemmaReady) await LLMModule?.unloadModel().catch(() => undefined)
      await releaseLocalContext()
      const config = activeCloudConfigRef.current
      setModelName(config ? `${cloudProviderById[config.providerId].title} · ${config.modelName}` : 'Облачная API-модель')
      setModelSize(0)
      updateReady(config ? await hasProviderApiKey(config.providerId) : false)
    } else {
      await releaseLocalContext()
      setModelName(GEMMA_TITLE)
      setModelSize(GEMMA_MODEL_BYTES)
    }
    updateEngine(next)
    if (next !== 'cloud') updateReady(false)
    setRuntimeError(null)
    await AsyncStorage.setItem(ACTIVE_AI_ENGINE_KEY, next)
  }, [releaseLocalContext, stopGeneration, updateEngine, updateReady])

  const invalidateCloudCredentials = useCallback((providerId: CloudProviderId) => {
    if (activeCloudConfigRef.current?.providerId !== providerId) return
    updateReady(false)
    setRuntimeError(`API-ключ ${cloudProviderById[providerId].title} удалён.`)
  }, [updateReady])

  const clearLocalModel = useCallback(async (modelId: string) => {
    if (activeLocalModelRef.current?.id !== modelId) return
    await stopGeneration()
    await releaseLocalContext()
    activeLocalModelRef.current = null
    setActiveLocalModelId(null)
    setModelName('Локальная GGUF-модель')
    setModelSize(0)
    updateReady(false)
    await AsyncStorage.removeItem(ACTIVE_LOCAL_MODEL_KEY)
  }, [releaseLocalContext, stopGeneration, updateReady])

  const ensureReady = useCallback(async () => {
    if (readyRef.current) return
    if (ensurePromiseRef.current) return ensurePromiseRef.current
    const promise = (async () => {
      if (engineRef.current === 'cloud') {
        const config = activeCloudConfigRef.current
        if (!config) throw new Error('AI_MODEL_MISSING: выберите API-модель в разделе AI assistant.')
        if (!await hasProviderApiKey(config.providerId)) {
          throw new Error(`AI_KEY_MISSING: добавьте API-ключ ${cloudProviderById[config.providerId].title}.`)
        }
        updateReady(true)
        return
      }
      if (engineRef.current === 'gemma') {
        const path = await ModelDownloader.getVerifiedModelPath(GEMMA_MODEL_FILE, GEMMA_MODEL_SHA256, GEMMA_MODEL_BYTES)
        if (!path) throw new Error('AI_MODEL_MISSING: скачайте Gemma в разделе AI assistant.')
        await loadGemma(path)
        return
      }
      const raw = await AsyncStorage.getItem(LOCAL_MODELS_STORAGE_KEY)
      const models = parseInstalledLocalModels(raw)
      const storedId = activeLocalModelRef.current?.id ?? await AsyncStorage.getItem(ACTIVE_LOCAL_MODEL_KEY)
      const model = models.find((item) => item.id === storedId) ?? models[0]
      if (!model) throw new Error('AI_MODEL_MISSING: выберите GGUF-модель в разделе AI assistant.')
      await loadLocalModel(model)
    })()
    ensurePromiseRef.current = promise
    try {
      await promise
    } finally {
      if (ensurePromiseRef.current === promise) ensurePromiseRef.current = null
    }
  }, [loadGemma, loadLocalModel, updateReady])

  const generate = useCallback(async (request: AiGenerationRequest): Promise<string> => {
    if (generatingRef.current) throw new Error('AI_BUSY: другая генерация уже выполняется.')
    await ensureReady()
    if (generatingRef.current) throw new Error('AI_BUSY: другая генерация уже выполняется.')
    const generationId = ++generationIdRef.current
    generatingRef.current = true
    generationOwnerRef.current = request.owner
    tokenSinkRef.current = request.onToken ?? null
    setGenerating(true)
    setGenerationOwner(request.owner)
    setRuntimeError(null)
    try {
      if (engineRef.current === 'cloud') {
        const config = activeCloudConfigRef.current
        if (!config) throw new Error('API-модель не выбрана.')
        const controller = new AbortController()
        cloudAbortRef.current = controller
        const response = await generateCloudResponse(
          config,
          request.localSystemPrompt,
          request.localUserMessage,
          controller.signal,
        )
        request.onToken?.(response)
        return response
      }
      if (engineRef.current === 'local') {
        const context = localContext.current
        if (!context) throw new Error('GGUF-модель не загружена.')
        return await generateLocalResponse(
          context,
          request.localSystemPrompt,
          request.localUserMessage,
          request.onToken ?? (() => undefined),
        )
      }
      if (!LLMModule) throw new Error('Gemma недоступна в этой сборке.')
      return await LLMModule.generateResponse(request.gemmaPrompt)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI не смог завершить анализ.'
      if (!/cancel|отмен/iu.test(message)) setRuntimeError(message)
      throw error
    } finally {
      if (generationIdRef.current === generationId) {
        cloudAbortRef.current = null
        generatingRef.current = false
        generationOwnerRef.current = null
        tokenSinkRef.current = null
        setGenerating(false)
        setGenerationOwner(null)
      }
    }
  }, [ensureReady])

  useEffect(() => () => {
    void stopGeneration()
    void releaseLocalContext()
  }, [releaseLocalContext, stopGeneration])

  return {
    activeCloudConfig,
    activeLocalModelId,
    clearLocalModel,
    engine,
    ensureReady,
    generate,
    generating,
    generationOwner,
    hydrated,
    invalidateCloudCredentials,
    loadGemma,
    loadCloudModel,
    loadLocalModel,
    loading,
    modelName,
    modelReady,
    modelSize,
    runtimeError,
    selectEngine,
    stopGeneration,
  }
}

export type OnDeviceAiRuntime = ReturnType<typeof useOnDeviceAiRuntime>
