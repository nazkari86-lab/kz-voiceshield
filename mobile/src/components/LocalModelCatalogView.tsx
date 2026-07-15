import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  DEFAULT_MODEL_SEARCH,
  formatModelBytes,
  loadGgufVariants,
  recommendedModelBytes,
  searchPublicGgufModels,
  type GgufVariant,
  type PublicGgufModel,
} from '../data/huggingFaceCatalog'
import type { InstalledLocalModel } from '../bridge/LocalLlmBridge'
import { colors } from '../theme'

type Props = {
  installedModels: InstalledLocalModel[]
  activeModelId: string | null
  availableBytes: number
  ramBytes: number
  busy: boolean
  downloadingVariantId: string | null
  downloadProgress: number | null
  error: string | null
  onDelete: (model: InstalledLocalModel) => Promise<void>
  onDownload: (model: PublicGgufModel, variant: GgufVariant) => Promise<void>
  onImport: () => Promise<void>
  onLoad: (model: InstalledLocalModel) => Promise<void>
}

const searchPresets = [
  ['Для телефона', DEFAULT_MODEL_SEARCH],
  ['Русский', 'Russian 1B Instruct GGUF'],
  ['Қазақша', 'Kazakh Instruct GGUF'],
] as const

const formatCount = (value: number) => value >= 1_000_000
  ? `${(value / 1_000_000).toFixed(1)}M`
  : value >= 1_000 ? `${Math.round(value / 1_000)}K` : String(value)

const quantizationNote = (quantization: string): string => {
  if (quantization === 'Q4_K_M') return 'лучший баланс'
  if (quantization.startsWith('Q5')) return 'выше качество'
  if (quantization.startsWith('Q8')) return 'почти максимум'
  if (quantization.startsWith('IQ2') || quantization.startsWith('Q2')) return 'минимальный размер'
  if (quantization === 'F16' || quantization === 'BF16') return 'очень тяжёлая'
  return 'другая квантизация'
}

export function LocalModelCatalogView({
  installedModels, activeModelId, availableBytes, ramBytes, busy, downloadingVariantId,
  downloadProgress, error, onDelete, onDownload, onImport, onLoad,
}: Props) {
  const [query, setQuery] = useState(DEFAULT_MODEL_SEARCH)
  const [models, setModels] = useState<PublicGgufModel[]>([])
  const [selectedModel, setSelectedModel] = useState<PublicGgufModel | null>(null)
  const [variants, setVariants] = useState<GgufVariant[]>([])
  const [searching, setSearching] = useState(false)
  const [loadingVariants, setLoadingVariants] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const searchAbort = useRef<AbortController | null>(null)
  const variantAbort = useRef<AbortController | null>(null)
  const recommendedBytes = useMemo(() => recommendedModelBytes(ramBytes), [ramBytes])
  const usableStorage = Math.max(0, availableBytes - 64 * 1024 * 1024)
  const recommendedVariantId = useMemo(() => {
    const fitting = variants.filter((variant) => variant.size <= Math.min(recommendedBytes, usableStorage))
    return (fitting.find((variant) => variant.quantization === 'Q4_K_M') ?? fitting[0])?.id ?? null
  }, [recommendedBytes, usableStorage, variants])

  const runSearch = useCallback(async (nextQuery: string) => {
    searchAbort.current?.abort()
    variantAbort.current?.abort()
    const controller = new AbortController()
    searchAbort.current = controller
    setSearching(true)
    setCatalogError(null)
    setSelectedModel(null)
    setVariants([])
    try {
      const result = await searchPublicGgufModels(nextQuery, controller.signal)
      setModels(result)
      if (result.length === 0) setCatalogError('Публичные текстовые GGUF-модели не найдены. Измените запрос.')
    } catch (cause) {
      if ((cause as Error).name !== 'AbortError') setCatalogError(cause instanceof Error ? cause.message : 'Не удалось открыть каталог моделей.')
    } finally {
      if (searchAbort.current === controller) setSearching(false)
    }
  }, [])

  useEffect(() => {
    void runSearch(DEFAULT_MODEL_SEARCH)
    return () => { searchAbort.current?.abort(); variantAbort.current?.abort() }
  }, [runSearch])

  const openModel = useCallback(async (model: PublicGgufModel) => {
    variantAbort.current?.abort()
    const controller = new AbortController()
    variantAbort.current = controller
    setSelectedModel(model)
    setVariants([])
    setLoadingVariants(true)
    setCatalogError(null)
    try {
      const result = await loadGgufVariants(model, controller.signal)
      setVariants(result)
      if (result.length === 0) setCatalogError('В репозитории нет одиночного GGUF-файла с проверяемым LFS SHA-256.')
    } catch (cause) {
      if ((cause as Error).name !== 'AbortError') setCatalogError(cause instanceof Error ? cause.message : 'Не удалось прочитать варианты модели.')
    } finally {
      if (variantAbort.current === controller) setLoadingVariants(false)
    }
  }, [])

  return (
    <View style={styles.root}>
      <View style={styles.introBand}>
        <Text style={styles.eyebrow}>LOCAL MODEL HUB</Text>
        <Text style={styles.title}>Каталог локальных AI-моделей</Text>
        <Text style={styles.copy}>Публичные GGUF-модели загружаются напрямую с Hugging Face, проверяются по SHA-256 и работают на телефоне без отправки транскрипта на сервер.</Text>
        <View style={styles.deviceRow}>
          <View style={styles.deviceMetric}><Text style={styles.deviceValue}>{formatModelBytes(availableBytes)}</Text><Text style={styles.deviceLabel}>свободно</Text></View>
          <View style={styles.deviceMetric}><Text style={styles.deviceValue}>{formatModelBytes(ramBytes)}</Text><Text style={styles.deviceLabel}>RAM</Text></View>
          <View style={styles.deviceMetric}><Text style={styles.deviceValue}>{formatModelBytes(recommendedBytes)}</Text><Text style={styles.deviceLabel}>рекомендуемый предел</Text></View>
        </View>
      </View>

      {installedModels.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Мои модели</Text>
          {installedModels.map((model) => {
            const active = model.id === activeModelId
            return (
              <View key={model.id} style={[styles.installedRow, active && styles.installedRowActive]}>
                <View style={styles.flex}>
                  <Text style={styles.modelName}>{model.title}</Text>
                  <Text style={styles.modelMeta}>{model.quantization} · {model.size ? formatModelBytes(model.size) : 'импорт'} · {model.license}</Text>
                </View>
                <Pressable accessibilityRole="button" disabled={busy} style={[styles.runButton, active && styles.activeButton]} onPress={() => { void onLoad(model) }}>
                  <Text style={styles.runButtonText}>{active ? 'Открыть' : 'Запустить'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={busy} style={styles.deleteButton} onPress={() => { void onDelete(model) }}>
                  <Text style={styles.deleteButtonText}>Удалить</Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <View style={styles.flex}><Text style={styles.sectionTitle}>Найти модель</Text><Text style={styles.sectionCopy}>Аккаунт не нужен для public/non-gated репозиториев.</Text></View>
          <Pressable accessibilityRole="button" disabled={busy} style={styles.importButton} onPress={() => { void onImport() }}><Text style={styles.importButtonText}>Импорт GGUF</Text></Pressable>
        </View>
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel="Поиск моделей Hugging Face"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            onChangeText={setQuery}
            onSubmitEditing={() => { void runSearch(query) }}
            placeholder="Например: Qwen 1.5B Instruct"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            value={query}
          />
          <Pressable accessibilityRole="button" disabled={busy || searching} style={styles.searchButton} onPress={() => { void runSearch(query) }}>
            {searching ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.searchButtonText}>Найти</Text>}
          </Pressable>
        </View>
        <View style={styles.presetRow}>
          {searchPresets.map(([label, value]) => <Pressable key={label} disabled={busy} style={styles.preset} onPress={() => { setQuery(value); void runSearch(value) }}><Text style={styles.presetText}>{label}</Text></Pressable>)}
        </View>
      </View>

      {(error || catalogError) && <Text style={styles.error}>{error || catalogError}</Text>}

      {!selectedModel && models.length > 0 && (
        <View style={styles.results}>
          <Text style={styles.sectionTitle}>Публичные GGUF-репозитории</Text>
          {models.map((model) => (
            <Pressable accessibilityRole="button" key={model.id} style={styles.modelRow} onPress={() => { void openModel(model) }}>
              <View style={styles.flex}>
                <Text style={styles.modelName}>{model.id.split('/').at(-1)?.replace(/-GGUF$/i, '')}</Text>
                <Text style={styles.repoName}>{model.id}</Text>
                <Text style={styles.modelMeta}>{model.license} · {formatCount(model.downloads)} загрузок · {formatCount(model.likes)} отметок</Text>
              </View>
              <Text style={styles.openLabel}>ВЫБРАТЬ</Text>
            </Pressable>
          ))}
        </View>
      )}

      {selectedModel && (
        <View style={styles.results}>
          <View style={styles.variantHeader}>
            <Pressable accessibilityRole="button" onPress={() => { setSelectedModel(null); setVariants([]) }}><Text style={styles.backLabel}>Назад</Text></Pressable>
            <View style={styles.flex}><Text style={styles.sectionTitle}>{selectedModel.id.split('/').at(-1)?.replace(/-GGUF$/i, '')}</Text><Text style={styles.repoName}>{selectedModel.id}</Text></View>
          </View>
          <Pressable onPress={() => { void Linking.openURL(`https://huggingface.co/${selectedModel.id}`) }}><Text style={styles.hfLink}>Карточка модели и лицензия · {selectedModel.license}</Text></Pressable>
          {loadingVariants && <View style={styles.loadingRow}><ActivityIndicator color={colors.brand} /><Text style={styles.sectionCopy}>Получаем квантизации…</Text></View>}
          {variants.map((variant) => {
            const downloading = downloadingVariantId === variant.id
            const recommended = recommendedVariantId === variant.id
            const fitsStorage = variant.size <= usableStorage
            const heavy = variant.size > recommendedBytes
            return (
              <View key={variant.id} style={[styles.variantRow, recommended && styles.variantRecommended]}>
                <View style={styles.flex}>
                  <View style={styles.variantTitleRow}>
                    <Text style={styles.quantization}>{variant.quantization}</Text>
                    {recommended && <Text style={styles.recommendedBadge}>РЕКОМЕНДУЕТСЯ</Text>}
                    {!recommended && heavy && <Text style={styles.heavyBadge}>ТЯЖЁЛАЯ</Text>}
                  </View>
                  <Text style={styles.modelMeta}>{formatModelBytes(variant.size)} · {quantizationNote(variant.quantization)}</Text>
                  <Text numberOfLines={1} style={styles.fileName}>{variant.fileName}</Text>
                  {downloading && downloadProgress !== null && <Text style={styles.progress}>Загрузка и проверка: {downloadProgress}%</Text>}
                  {!fitsStorage && <Text style={styles.storageError}>Недостаточно свободного места с безопасным запасом.</Text>}
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy || !fitsStorage}
                  style={[styles.downloadButton, (busy || !fitsStorage) && styles.disabled]}
                  onPress={() => { void onDownload(selectedModel, variant) }}
                >
                  {downloading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.downloadButtonText}>Скачать</Text>}
                </Pressable>
              </View>
            )
          })}
        </View>
      )}

      <Text style={styles.disclaimer}>Каталог показывает только публичные одиночные GGUF-файлы с LFS SHA-256. Совместимость конкретной архитектуры зависит от встроенной версии llama.cpp; лицензия модели отображается до загрузки.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  introBand: { backgroundColor: colors.brandDark, borderRadius: 8, gap: 7, padding: 16 },
  eyebrow: { color: '#8fe0bd', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#fff', fontSize: 21, fontWeight: '900', lineHeight: 26 },
  copy: { color: '#c1dfd0', fontSize: 12, lineHeight: 18 },
  deviceRow: { flexDirection: 'row', gap: 7, marginTop: 5 },
  deviceMetric: { backgroundColor: '#174f3f', borderRadius: 6, flex: 1, padding: 8 },
  deviceValue: { color: '#fff', fontSize: 13, fontWeight: '900' },
  deviceLabel: { color: '#add4c3', fontSize: 8, lineHeight: 11, marginTop: 2 },
  section: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 9, padding: 13 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  sectionCopy: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  searchRow: { flexDirection: 'row', gap: 7 },
  searchInput: { backgroundColor: colors.chipBg, borderColor: colors.border, borderRadius: 7, borderWidth: 1, color: colors.ink, flex: 1, fontSize: 12, minHeight: 44, paddingHorizontal: 11 },
  searchButton: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: 7, justifyContent: 'center', minWidth: 76, paddingHorizontal: 12 },
  searchButtonText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  preset: { backgroundColor: colors.softBrand, borderColor: colors.border, borderRadius: 5, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6 },
  presetText: { color: colors.brandDark, fontSize: 9, fontWeight: '800' },
  importButton: { borderColor: colors.brand, borderRadius: 6, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7 },
  importButtonText: { color: colors.brandDark, fontSize: 9, fontWeight: '900' },
  results: { gap: 8 },
  modelRow: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 12 },
  modelName: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  repoName: { color: colors.brand, fontSize: 9, fontWeight: '700', marginTop: 2 },
  modelMeta: { color: colors.sub, fontSize: 9, lineHeight: 13, marginTop: 3 },
  openLabel: { color: colors.brandDark, fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  variantHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  backLabel: { color: colors.brandDark, fontSize: 10, fontWeight: '900', paddingVertical: 8 },
  hfLink: { color: colors.brandDark, fontSize: 10, fontWeight: '800', textDecorationLine: 'underline' },
  loadingRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingVertical: 12 },
  variantRow: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 11 },
  variantRecommended: { backgroundColor: colors.softBrand, borderColor: colors.brand },
  variantTitleRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quantization: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  recommendedBadge: { backgroundColor: colors.brand, borderRadius: 4, color: '#fff', fontSize: 7, fontWeight: '900', paddingHorizontal: 5, paddingVertical: 3 },
  heavyBadge: { backgroundColor: '#fff0d9', borderRadius: 4, color: '#9a5500', fontSize: 7, fontWeight: '900', paddingHorizontal: 5, paddingVertical: 3 },
  fileName: { color: colors.muted, fontSize: 8, marginTop: 3 },
  progress: { color: colors.brandDark, fontSize: 10, fontWeight: '900', marginTop: 5 },
  storageError: { color: '#9f2339', fontSize: 9, fontWeight: '800', marginTop: 4 },
  downloadButton: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: 6, justifyContent: 'center', minHeight: 42, minWidth: 74, paddingHorizontal: 10 },
  downloadButtonText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  installedRow: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 7, paddingTop: 9 },
  installedRowActive: { backgroundColor: colors.softBrand, borderRadius: 6, paddingHorizontal: 7, paddingBottom: 7 },
  runButton: { backgroundColor: colors.brand, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 7 },
  activeButton: { backgroundColor: colors.brandDark },
  runButtonText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  deleteButton: { paddingHorizontal: 4, paddingVertical: 7 },
  deleteButtonText: { color: '#9f2339', fontSize: 8, fontWeight: '900' },
  error: { backgroundColor: '#fee2e2', borderRadius: 6, color: '#991b1b', fontSize: 11, padding: 9 },
  disclaimer: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  disabled: { opacity: 0.45 },
  flex: { flex: 1 },
})
