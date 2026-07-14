import React, { useCallback, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import {
  llmEvents, LLMModule, GEMMA_MODEL_BYTES, GEMMA_MODEL_FILE, GEMMA_MODEL_SHA256,
  GEMMA_MODEL_SIZE_MB, GEMMA_MODEL_URL, GEMMA_TERMS_URL,
} from '../bridge/LLMBridge'
import { modelEvents, ModelDownloader } from '../bridge/WhisperBridge'
import { buildPrompt, QUICK_QUESTIONS, SYSTEM_PROMPT } from '../utils/llmPrompts'
import { colors } from '../theme'
import { Card, SectionTitle } from './ui'

type ChatMessage = { role: 'user' | 'assistant'; text: string; streaming?: boolean }

type Props = { transcript: string; modelBasePath?: string }
const GEMMA_TERMS_ACCEPTED_KEY = 'voiceshield.gemma.terms.v1'

export function LLMAssistantView({ transcript, modelBasePath }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const [loadingModel, setLoadingModel] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [modelPath, setModelPath] = useState<string | null>(modelBasePath ?? null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const scrollRef = useRef<ScrollView>(null)
  const currentTokensRef = useRef('')

  // Check model readiness on mount
  useEffect(() => {
    void LLMModule?.isReady().then(setModelReady).catch(() => setModelReady(false))
    void AsyncStorage.getItem(GEMMA_TERMS_ACCEPTED_KEY).then(value => setTermsAccepted(value === 'accepted')).catch(() => undefined)
    if (!modelBasePath) {
      void ModelDownloader.getVerifiedModelPath(GEMMA_MODEL_FILE, GEMMA_MODEL_SHA256, GEMMA_MODEL_BYTES)
        .then(setModelPath)
        .catch(() => undefined)
    }
  }, [modelBasePath])

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
    return () => { tokenSub.remove(); doneSub.remove(); errSub.remove() }
  }, [])

  const loadModel = useCallback(async () => {
    if (!LLMModule) { setLoadError('LLM module not available on this build'); return }
    setLoadingModel(true)
    setLoadError(null)
    try {
      const path = modelPath ?? (modelBasePath ? `${modelBasePath}${modelBasePath.endsWith('/') ? '' : '/'}${GEMMA_MODEL_FILE}` : null)
      if (!path) throw new Error('Download Gemma first, then import the .task file from Downloads.')
      await LLMModule.loadModel(path, 1024)
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
      await LLMModule.loadModel(path, 1024)
      setModelReady(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not import the Gemma model'
      if (!message.includes('MODEL_IMPORT_CANCELLED')) setLoadError(message)
    } finally {
      setLoadingModel(false)
    }
  }, [])

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
      await LLMModule.loadModel(path, 1024)
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
      const fullPrompt = buildPrompt(SYSTEM_PROMPT, text.trim() + '\n\n', transcript)
      await LLMModule!.generateResponse(fullPrompt)
    } catch (e: any) {
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.streaming) return [...prev.slice(0, -1), { role: 'assistant', text: `⚠ ${e?.message ?? 'Error'}` }]
        return prev
      })
      setGenerating(false)
    }
  }, [generating, modelReady, transcript])

  const sendQuick = useCallback((q: (typeof QUICK_QUESTIONS)[number]) => {
    void send(q.prompt)
  }, [send])

  const stop = useCallback(() => {
    void LLMModule?.cancelGeneration()
    setGenerating(false)
  }, [])

  if (!modelReady) {
    return (
      <View style={styles.root}>
        <SectionTitle>VoiceShield AI (Gemma 3 1B)</SectionTitle>
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
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SectionTitle>VoiceShield AI</SectionTitle>

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
