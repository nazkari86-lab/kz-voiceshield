import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  cloudProviderById,
  cloudProviders,
  type CapabilityState,
  type CloudModel,
  type CloudModelConfig,
  type CloudProviderId,
} from '../data/cloudAiProviders'
import {
  hasProviderDataConsent,
  hasProviderApiKey,
  listCloudModels,
  removeProviderApiKey,
  saveProviderApiKey,
  setProviderDataConsent,
} from '../services/cloudAiClient'
import { colors } from '../theme'
import { SecureStorage } from '../bridge/SecureStorageBridge'

type Props = {
  activeConfig: CloudModelConfig | null
  busy: boolean
  error: string | null
  onActivate: (config: CloudModelConfig) => Promise<void>
  onCredentialRemoved: (providerId: CloudProviderId) => void
}

type PriceFilter = 'all' | 'free' | 'paid'

const capabilityLabel: Record<string, string> = {
  chat: 'CHAT', liveAnalysis: 'LIVE AI', tools: 'TOOLS', vision: 'VISION', image: 'IMAGE', voice: 'VOICE',
}

const capabilityStateLabel: Record<CapabilityState, string> = {
  available: 'есть', model_dependent: 'по модели', proxy_required: 'через proxy', unsupported: 'нет',
}

export function CloudProviderCatalogView({ activeConfig, busy, error, onActivate, onCredentialRemoved }: Props) {
  const [providerId, setProviderId] = useState<CloudProviderId>(activeConfig?.providerId ?? 'openai')
  const [apiKey, setApiKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [dataConsent, setDataConsent] = useState(false)
  const [models, setModels] = useState<CloudModel[]>([])
  const [query, setQuery] = useState('')
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all')
  const [loading, setLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const provider = cloudProviderById[providerId]

  const refresh = useCallback(async (nextProviderId: CloudProviderId) => {
    setLoading(true)
    setCatalogError(null)
    try {
      const [saved, consented] = await Promise.all([
        hasProviderApiKey(nextProviderId),
        hasProviderDataConsent(nextProviderId),
      ])
      setKeySaved(saved)
      setDataConsent(consented)
      if (!saved) {
        setModels([])
        return
      }
      const result = await listCloudModels(nextProviderId)
      setModels(result)
      if (result.length === 0) setCatalogError('Провайдер не вернул совместимые текстовые модели.')
    } catch (cause) {
      setModels([])
      setCatalogError(cause instanceof Error ? cause.message : 'Не удалось получить модели провайдера.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh(providerId) }, [providerId, refresh])

  useEffect(() => {
    void SecureStorage.setScreenCaptureBlocked(true).catch(() => undefined)
    return () => { void SecureStorage.setScreenCaptureBlocked(false).catch(() => undefined) }
  }, [])

  const connect = useCallback(async () => {
    const candidate = apiKey.trim()
    if (!candidate) {
      setCatalogError('Введите API-ключ.')
      return
    }
    setLoading(true)
    setCatalogError(null)
    try {
      const result = await listCloudModels(providerId, candidate)
      if (result.length === 0) throw new Error('Ключ принят, но доступные текстовые модели не найдены.')
      await saveProviderApiKey(providerId, candidate)
      setApiKey('')
      setKeySaved(true)
      setModels(result)
    } catch (cause) {
      setCatalogError(cause instanceof Error ? cause.message : 'Проверка API-ключа не удалась.')
    } finally {
      setLoading(false)
    }
  }, [apiKey, providerId])

  const disconnect = useCallback(async () => {
    setLoading(true)
    setCatalogError(null)
    try {
      await removeProviderApiKey(providerId)
      setKeySaved(false)
      setDataConsent(false)
      setModels([])
      setApiKey('')
      onCredentialRemoved(providerId)
    } catch (cause) {
      setCatalogError(cause instanceof Error ? cause.message : 'Не удалось удалить ключ.')
    } finally {
      setLoading(false)
    }
  }, [onCredentialRemoved, providerId])

  const toggleDataConsent = useCallback(async () => {
    const next = !dataConsent
    setLoading(true)
    setCatalogError(null)
    try {
      await setProviderDataConsent(providerId, next)
      setDataConsent(next)
    } catch (cause) {
      setCatalogError(cause instanceof Error ? cause.message : 'Не удалось сохранить согласие.')
    } finally {
      setLoading(false)
    }
  }, [dataConsent, providerId])

  const visibleModels = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return models.filter((model) => {
      if (priceFilter === 'free' && !model.free) return false
      if (priceFilter === 'paid' && model.free) return false
      return !needle || model.name.toLowerCase().includes(needle) || model.id.toLowerCase().includes(needle)
    }).slice(0, 80)
  }, [models, priceFilter, query])

  return (
    <View style={styles.root}>
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>OFFICIAL API HUB</Text>
        <Text style={styles.title}>Облачные AI-модели</Text>
        <Text style={styles.introText}>Подключите собственный ключ. Ключ шифруется AES-GCM ключом Android Keystore, не отображается после сохранения и отправляется только выбранному официальному API.</Text>
      </View>

      <View style={styles.providers}>
        {cloudProviders.map((item) => (
          <Pressable
            key={item.id}
            disabled={busy || loading}
            style={[styles.providerChip, providerId === item.id && styles.providerChipActive]}
            onPress={() => { setProviderId(item.id); setApiKey(''); setKeySaved(false); setDataConsent(false); setModels([]); setQuery(''); setPriceFilter('all') }}
          >
            <Text style={[styles.providerText, providerId === item.id && styles.providerTextActive]}>{item.title}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.providerCard}>
        <View style={styles.providerHeading}>
          <View style={styles.flex}>
            <Text style={styles.providerTitle}>{provider.title}</Text>
            <Text style={styles.providerCompany}>{provider.company}</Text>
          </View>
          <Text style={[styles.keyStatus, keySaved && styles.keyStatusReady]}>{keySaved ? 'KEY SAVED' : 'NO KEY'}</Text>
        </View>
        <View style={styles.capabilities}>
          {(Object.entries(provider.capabilities) as Array<[string, CapabilityState]>).map(([name, state]) => (
            <View key={name} style={[styles.capability, state === 'unsupported' && styles.capabilityMuted]}>
              <Text style={styles.capabilityName}>{capabilityLabel[name]}</Text>
              <Text style={styles.capabilityState}>{capabilityStateLabel[state]}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.runtimeNotice}>Сейчас внутри VoiceShield полностью подключены CHAT и LIVE AI. Остальные метки показывают возможности API провайдера и требуют отдельного мультимодального runtime.</Text>
        {(provider.capabilities.voice === 'proxy_required') && (
          <Text style={styles.securityNotice}>Realtime voice требует backend с краткоживущим ephemeral token. Master API key намеренно не используется напрямую в WebRTC.</Text>
        )}
        <View style={styles.linkRow}>
          <Pressable onPress={() => { void Linking.openURL(provider.keyUrl) }}><Text style={styles.link}>Получить ключ</Text></Pressable>
          <Pressable onPress={() => { void Linking.openURL(provider.docsUrl) }}><Text style={styles.link}>Документация API</Text></Pressable>
        </View>
      </View>

      {!keySaved ? (
        <View style={styles.keyCard}>
          <Text style={styles.sectionTitle}>Подключение</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            editable={!loading && !busy}
            importantForAutofill="no"
            maxLength={4096}
            onChangeText={setApiKey}
            placeholder={`API key для ${provider.title}`}
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.keyInput}
            textContentType="password"
            value={apiKey}
          />
          <Pressable disabled={loading || busy || !apiKey.trim()} style={[styles.connectButton, (loading || busy || !apiKey.trim()) && styles.disabled]} onPress={() => { void connect() }}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.connectText}>Проверить и сохранить</Text>}
          </Pressable>
          <Text style={styles.keyFootnote}>Сначала выполняется запрос списка моделей. Неверный ключ не сохраняется.</Text>
        </View>
      ) : (
        <View style={styles.keyActions}>
          <Pressable disabled={loading || busy} style={styles.refreshButton} onPress={() => { void refresh(providerId) }}><Text style={styles.refreshText}>Обновить модели</Text></Pressable>
          <Pressable disabled={loading || busy} style={styles.removeButton} onPress={() => { void disconnect() }}><Text style={styles.removeText}>Удалить ключ</Text></Pressable>
        </View>
      )}

      {(error || catalogError) && <Text style={styles.error}>{error || catalogError}</Text>}

      {keySaved && (
        <View style={styles.modelSection}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dataConsent }}
            disabled={loading || busy}
            style={[styles.consentCard, dataConsent && styles.consentCardAccepted]}
            onPress={() => { void toggleDataConsent() }}
          >
            <View style={[styles.checkbox, dataConsent && styles.checkboxChecked]}>
              {dataConsent && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <View style={styles.flex}>
              <Text style={styles.consentTitle}>Разрешить запросы в {provider.title}</Text>
              <Text style={styles.consentText}>VoiceShield будет отправлять выбранной модели текст ваших сообщений и, только после отдельного включения, обезличенные фрагменты транскрипта. Аудио, контакты и сохранённые дела не отправляются.</Text>
            </View>
          </Pressable>
          {!dataConsent && <Text style={styles.consentRequired}>Выбор модели заблокирован, пока вы явно не разрешите передачу текста этому провайдеру.</Text>}
          <View style={styles.modelHeader}>
            <View style={styles.flex}><Text style={styles.sectionTitle}>Модели аккаунта</Text><Text style={styles.modelCount}>{models.length} получено от API</Text></View>
            {loading && <ActivityIndicator color={colors.brand} />}
          </View>
          <TextInput value={query} onChangeText={setQuery} placeholder="Поиск модели" placeholderTextColor={colors.muted} style={styles.searchInput} />
          <View style={styles.filters}>
            {(['all', 'free', 'paid'] as PriceFilter[]).map((filter) => (
              <Pressable key={filter} style={[styles.filter, priceFilter === filter && styles.filterActive]} onPress={() => setPriceFilter(filter)}>
                <Text style={[styles.filterText, priceFilter === filter && styles.filterTextActive]}>{filter === 'all' ? 'Все' : filter === 'free' ? 'Бесплатные' : 'Платные/остальные'}</Text>
              </Pressable>
            ))}
          </View>
          {visibleModels.map((model) => {
            const active = activeConfig?.providerId === providerId && activeConfig.modelId === model.id
            return (
              <View key={model.id} style={[styles.modelRow, active && styles.modelRowActive]}>
                <View style={styles.flex}>
                  <Text style={styles.modelName}>{model.name}</Text>
                  <Text numberOfLines={1} style={styles.modelId}>{model.id}</Text>
                  <Text style={styles.modelMeta}>{model.priceLabel}{model.contextLength ? ` · ${Math.round(model.contextLength / 1000)}K context` : ''}</Text>
                  {model.capabilities.length > 0 && <Text numberOfLines={1} style={styles.modelCapabilities}>{model.capabilities.join(' · ')}</Text>}
                </View>
                <Pressable
                  disabled={busy || loading || active || !dataConsent}
                  style={[styles.useButton, active && styles.useButtonActive, (busy || loading || !dataConsent) && styles.disabled]}
                  onPress={() => { void onActivate({ providerId, modelId: model.id, modelName: model.name }) }}
                >
                  <Text style={styles.useText}>{active ? 'ACTIVE' : 'USE'}</Text>
                </Pressable>
              </View>
            )
          })}
          {!loading && visibleModels.length === 0 && <Text style={styles.empty}>Нет моделей для выбранного фильтра.</Text>}
        </View>
      )}

      <Text style={styles.disclaimer}>Защита относится к хранению на обычном незарутованном Android. Во время HTTPS-запроса ключ кратковременно существует в памяти процесса; абсолютная защита на rooted/скомпрометированном устройстве невозможна. Для максимальной безопасности используйте ограниченный ключ, лимиты расходов и backend proxy.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 11 },
  intro: { backgroundColor: '#163b59', borderRadius: 8, gap: 6, padding: 16 },
  eyebrow: { color: '#86d4ff', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#fff', fontSize: 21, fontWeight: '900' },
  introText: { color: '#c8dfed', fontSize: 12, lineHeight: 18 },
  providers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  providerChip: { borderColor: colors.border, borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  providerChipActive: { backgroundColor: '#163b59', borderColor: '#163b59' },
  providerText: { color: colors.sub, fontSize: 10, fontWeight: '900' },
  providerTextActive: { color: '#fff' },
  providerCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 10, padding: 13 },
  providerHeading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  providerTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  providerCompany: { color: colors.sub, fontSize: 10, marginTop: 2 },
  keyStatus: { backgroundColor: '#fee2e2', borderRadius: 5, color: '#991b1b', fontSize: 8, fontWeight: '900', padding: 6 },
  keyStatusReady: { backgroundColor: colors.softBrand, color: colors.brandDark },
  capabilities: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  capability: { backgroundColor: colors.chipBg, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 5 },
  capabilityMuted: { opacity: 0.5 },
  capabilityName: { color: colors.ink, fontSize: 8, fontWeight: '900' },
  capabilityState: { color: colors.sub, fontSize: 7, marginTop: 1 },
  runtimeNotice: { color: colors.sub, fontSize: 9, lineHeight: 14 },
  securityNotice: { backgroundColor: '#fff7ed', borderRadius: 6, color: '#9a3412', fontSize: 10, lineHeight: 15, padding: 8 },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 15 },
  link: { color: colors.brandDark, fontSize: 10, fontWeight: '900', textDecorationLine: 'underline' },
  keyCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 8, padding: 13 },
  sectionTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  keyInput: { backgroundColor: colors.chipBg, borderColor: colors.border, borderRadius: 7, borderWidth: 1, color: colors.ink, minHeight: 46, paddingHorizontal: 11 },
  connectButton: { alignItems: 'center', backgroundColor: '#163b59', borderRadius: 7, minHeight: 44, justifyContent: 'center' },
  connectText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  keyFootnote: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  keyActions: { flexDirection: 'row', gap: 8 },
  refreshButton: { borderColor: colors.brand, borderRadius: 6, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9 },
  refreshText: { color: colors.brandDark, fontSize: 9, fontWeight: '900' },
  removeButton: { borderColor: '#c94949', borderRadius: 6, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9 },
  removeText: { color: '#9f2339', fontSize: 9, fontWeight: '900' },
  error: { backgroundColor: '#fee2e2', borderRadius: 6, color: '#991b1b', fontSize: 11, lineHeight: 16, padding: 9 },
  modelSection: { gap: 8 },
  consentCard: { alignItems: 'flex-start', backgroundColor: '#fff7ed', borderColor: '#fdba74', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 11 },
  consentCardAccepted: { backgroundColor: colors.softBrand, borderColor: colors.brand },
  checkbox: { alignItems: 'center', borderColor: colors.muted, borderRadius: 4, borderWidth: 1, height: 21, justifyContent: 'center', marginTop: 1, width: 21 },
  checkboxChecked: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkboxMark: { color: '#fff', fontSize: 13, fontWeight: '900' },
  consentTitle: { color: colors.ink, fontSize: 11, fontWeight: '900' },
  consentText: { color: colors.sub, fontSize: 9, lineHeight: 14, marginTop: 3 },
  consentRequired: { color: '#9a3412', fontSize: 9, fontWeight: '800', lineHeight: 14 },
  modelHeader: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  modelCount: { color: colors.muted, fontSize: 9, marginTop: 2 },
  searchInput: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 7, borderWidth: 1, color: colors.ink, minHeight: 44, paddingHorizontal: 11 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  filter: { backgroundColor: colors.chipBg, borderRadius: 5, paddingHorizontal: 9, paddingVertical: 6 },
  filterActive: { backgroundColor: '#163b59' },
  filterText: { color: colors.sub, fontSize: 9, fontWeight: '800' },
  filterTextActive: { color: '#fff' },
  modelRow: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 11 },
  modelRowActive: { backgroundColor: colors.softBrand, borderColor: colors.brand },
  modelName: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  modelId: { color: colors.brand, fontSize: 9, marginTop: 2 },
  modelMeta: { color: colors.sub, fontSize: 9, marginTop: 4 },
  modelCapabilities: { color: colors.muted, fontSize: 8, marginTop: 3 },
  useButton: { alignItems: 'center', backgroundColor: '#163b59', borderRadius: 6, justifyContent: 'center', minHeight: 40, minWidth: 58, paddingHorizontal: 8 },
  useButtonActive: { backgroundColor: colors.brand },
  useText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  empty: { color: colors.muted, fontSize: 11, paddingVertical: 14, textAlign: 'center' },
  disclaimer: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  disabled: { opacity: 0.45 },
  flex: { flex: 1 },
})
