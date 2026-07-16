import React, { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors } from '../theme'
import { Card, Metric, SectionTitle, ui } from './ui'
import { modelManifest } from '../data/modelManifest'
import { kazakhQualityPackComponents } from '../data/kazakhQualityPack'
import { ModelDownloader } from '../bridge/WhisperBridge'
import { buildKnowledgeGraph, type KnowledgeGraph } from '../data/knowledgeGraph'
import { whisperModels } from '../data/whisperModels'
import { loadKnowledgeNotes, saveKnowledgeNote, type KnowledgeNote } from '../utils/knowledgeNotes'
import { useI18n } from '../I18nContext'

function KnowledgeNotesPanel({ graph }: { graph: KnowledgeGraph }) {
  const { lang } = useI18n()
  const copy = lang === 'kz'
    ? { title: 'Жеке білім жазбалары', detail: 'Жазбалар құрылғыда Android Keystore арқылы шифрланып сақталады және серверге жіберілмейді.', select: 'Контекст', placeholder: 'Осы мүмкіндікке, модельге немесе әрекетке жазба қосыңыз', save: 'Жазбаны сақтау', saved: 'Жазба шифрланып сақталды.', unavailable: 'Шифрланған сақтау бұл жинақта қолжетімсіз.' }
    : lang === 'en'
      ? { title: 'Private knowledge notes', detail: 'Notes are encrypted on this device through Android Keystore and are never sent to a server.', select: 'Context', placeholder: 'Add a note about this feature, model, or action', save: 'Save note', saved: 'The note was saved in encrypted storage.', unavailable: 'Encrypted storage is unavailable in this build.' }
      : { title: 'Личные заметки к знаниям', detail: 'Заметки шифруются на устройстве через Android Keystore и не отправляются на сервер.', select: 'Контекст', placeholder: 'Добавьте заметку об этой функции, модели или действии', save: 'Сохранить заметку', saved: 'Заметка сохранена в зашифрованном хранилище.', unavailable: 'Зашифрованное хранилище недоступно в этой сборке.' }
  const targets = useMemo(() => graph.nodes.filter((node) => node.type === 'app' || node.type === 'feature' || node.type === 'advice').slice(0, 10), [graph.nodes])
  const [notes, setNotes] = useState<KnowledgeNote[]>([])
  const [nodeId, setNodeId] = useState('app:voiceshield')
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    void loadKnowledgeNotes().then(setNotes).catch(() => setStatus(copy.unavailable))
  }, [copy.unavailable])

  useEffect(() => {
    setDraft(notes.find((note) => note.nodeId === nodeId)?.text ?? '')
  }, [nodeId, notes])

  const save = async () => {
    try {
      setNotes(await saveKnowledgeNote(nodeId, draft))
      setStatus(copy.saved)
    } catch {
      setStatus(copy.unavailable)
    }
  }

  return (
    <>
      <SectionTitle>{copy.title}</SectionTitle>
      <Card>
        <Text style={styles.body}>{copy.detail}</Text>
        <Text style={styles.noteLabel}>{copy.select}</Text>
        <View style={styles.noteTargets}>
          {targets.map((node) => <Pressable key={node.id} onPress={() => setNodeId(node.id)} style={[styles.noteTarget, node.id === nodeId && styles.noteTargetActive]}><Text style={[styles.noteTargetText, node.id === nodeId && styles.noteTargetTextActive]}>{node.title}</Text></Pressable>)}
        </View>
        <TextInput value={draft} onChangeText={setDraft} maxLength={1000} multiline placeholder={copy.placeholder} placeholderTextColor={colors.muted} style={styles.noteInput} textAlignVertical="top" />
        <Pressable onPress={() => { void save() }} style={styles.noteSave}><Text style={styles.noteSaveText}>{copy.save}</Text></Pressable>
        {status ? <Text style={styles.noteStatus}>{status}</Text> : null}
      </Card>
    </>
  )
}

export function ModelView() {
  const { activeDetector, ml, privacy } = modelManifest
  const snap = ml.trainedOn
  const origins = Object.entries(snap.byOrigin ?? {})
  const langs = Object.entries(snap.byLanguage ?? {})
  const [graph, setGraph] = useState<KnowledgeGraph>(() => buildKnowledgeGraph())

  useEffect(() => {
    void (async () => {
      const [storage, ...paths] = await Promise.all([ModelDownloader.getStorageInfo(), ...whisperModels.map((model) => ModelDownloader.getModelPath(model.file))])
      const installedModelIds = whisperModels.filter((_, index) => Boolean(paths[index])).map((model) => model.id)
      setGraph(buildKnowledgeGraph(storage, { installedModelIds }))
    })().catch(() => undefined)
  }, [])

  return (
    <View>
      <SectionTitle>Active detector</SectionTitle>
      <Card>
        <Text style={styles.title}>{activeDetector.name}</Text>
        <Text style={styles.meta}>{activeDetector.ruleCount} rules · {activeDetector.machineLearned ? 'machine-learned' : 'deterministic, not ML'}</Text>
        <Text style={styles.body}>{activeDetector.note}</Text>
      </Card>

      <KnowledgeNotesPanel graph={graph} />

      <SectionTitle>Knowledge graph</SectionTitle>
      <Card>
        <Text style={styles.meta}>Schema {graph.schemaVersion} · {graph.nodes.length} nodes · {graph.edges.length} relationships</Text>
        {graph.nodes.filter((node) => node.type === 'model' || node.type === 'advice').slice(0, 8).map((node) => (
          <View key={node.id} style={styles.row}><Text style={styles.rowKey}>{node.title}</Text><Text style={styles.rowVal}>{node.status ?? 'active'}</Text></View>
        ))}
      </Card>

      <SectionTitle>Recent Kazakhstan operation coverage</SectionTitle>
      {activeDetector.localOperations.map((operation) => (
        <Card key={operation.id} tone="high">
          <View style={styles.operationTopline}>
            <Text style={styles.title}>{operation.title}</Text>
            <Text style={styles.period}>{operation.period}</Text>
          </View>
          <Text style={styles.link}>{operation.source}</Text>
        </Card>
      ))}

      <SectionTitle>Kazakh quality pack status</SectionTitle>
      <Card>
        {kazakhQualityPackComponents.map((component) => (
          <View key={component.id} style={styles.row}>
            <View style={styles.packCopy}>
              <Text style={styles.rowKey}>{component.title}</Text>
              <Text style={styles.packPurpose}>{component.purpose}</Text>
            </View>
            <Text style={[styles.statusChip, component.status === 'bundled' ? styles.bundled : component.status === 'downloadable' ? styles.downloadable : styles.external]}>
              {component.status === 'bundled' ? 'BUNDLED' : component.status === 'downloadable' ? 'DOWNLOAD' : 'EXTERNAL'}
            </Text>
          </View>
        ))}
        <Text style={styles.body}>Large ASR and GGUF files are downloaded only after consent and verified by size and SHA-256; they are not silently embedded into the APK.</Text>
      </Card>

      <SectionTitle>Experimental ML model</SectionTitle>
      <Card>
        <Text style={styles.title}>Baseline {ml.version}</Text>
        <Text style={styles.status}>{ml.status}</Text>
        <Text style={styles.meta}>{ml.embeddingModel} · {ml.classifier}</Text>
      </Card>

      <SectionTitle>Training corpus ({snap.total} examples · {snap.generatedAt})</SectionTitle>
      <View style={ui.row}>
        <Metric value={snap.total} label="total examples" />
        <Metric value={snap.trustedReal} label="real donated" />
        <Metric value={snap.byLabel?.true_positive ?? 0} label="fraud" />
        <Metric value={snap.byLabel?.false_positive ?? 0} label="safe" />
      </View>

      <Card>
        <Text style={styles.subhead}>By source</Text>
        {origins.map(([origin, count]) => (
          <View key={origin} style={styles.row}>
            <Text style={styles.rowKey}>{origin}</Text>
            <Text style={styles.rowVal}>{count as number}</Text>
          </View>
        ))}
        <Text style={styles.subhead}>By language</Text>
        {langs.map(([lang, count]) => (
          <View key={lang} style={styles.row}>
            <Text style={styles.rowKey}>{lang}</Text>
            <Text style={styles.rowVal}>{count as number}</Text>
          </View>
        ))}
      </Card>

      {snap.evaluation && (
        <>
          <SectionTitle>Baseline evaluation</SectionTitle>
          <View style={ui.row}>
            <Metric value={`${Math.round(snap.evaluation.accuracy * 100)}%`} label="accuracy" />
            <Metric value={snap.evaluation.macroF1.toFixed(2)} label="macro F1" />
            <Metric value={snap.evaluation.testCount} label="held-out test" />
            <Metric value={snap.evaluation.trainCount} label="train" />
          </View>
          <Card tone="medium">
            <Text style={styles.meta}>{snap.evaluation.vectorizer} · {snap.evaluation.trainingMode}</Text>
            <Text style={styles.body}>⚠ {snap.evaluation.caveat}</Text>
          </Card>
        </>
      )}

      <SectionTitle>Data sources</SectionTitle>
      {ml.sources.map((s) => (
        <Card key={s.name}>
          <Text style={styles.title}>{s.name}</Text>
          <Text style={styles.meta}>{s.role}</Text>
          {s.link && <Text style={styles.link}>{s.link}</Text>}
        </Card>
      ))}

      <SectionTitle>How this model is built</SectionTitle>
      <Card>
        {ml.caveats.map((c) => <Text key={c} style={styles.bullet}>• {c}</Text>)}
      </Card>

      <Card tone="low">
        <Text style={styles.subhead}>Privacy</Text>
        <Text style={styles.body}>{privacy}</Text>
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  status: { color: '#9a3412', fontSize: 12, fontWeight: '800' },
  meta: { color: colors.sub, fontSize: 12 },
  body: { color: '#334155', fontSize: 13, lineHeight: 19 },
  subhead: { color: colors.ink, fontSize: 13, fontWeight: '800', marginTop: 4 },
  bullet: { color: '#334155', fontSize: 13, lineHeight: 20 },
  link: { color: colors.brand, fontSize: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  rowKey: { color: colors.sub, fontSize: 13 },
  rowVal: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  operationTopline: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  period: { color: colors.brandDark, fontSize: 11, fontWeight: '900' },
  packCopy: { flex: 1, gap: 2 },
  packPurpose: { color: colors.muted, fontSize: 11 },
  statusChip: { borderRadius: 6, borderWidth: 1, fontSize: 9, fontWeight: '900', paddingHorizontal: 7, paddingVertical: 5 },
  bundled: { backgroundColor: '#dcfce7', borderColor: '#86efac', color: '#166534' },
  downloadable: { backgroundColor: '#dbeafe', borderColor: '#93c5fd', color: '#1d4ed8' },
  external: { backgroundColor: '#fef3c7', borderColor: '#fcd34d', color: '#92400e' },
  noteLabel: { color: colors.ink, fontSize: 12, fontWeight: '900', marginTop: 2 },
  noteTargets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  noteTarget: { borderColor: colors.border, borderRadius: 7, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7 },
  noteTargetActive: { backgroundColor: colors.softBrand, borderColor: colors.brand },
  noteTargetText: { color: colors.sub, fontSize: 11, fontWeight: '800' },
  noteTargetTextActive: { color: colors.brandDark },
  noteInput: { backgroundColor: colors.chipBg, borderColor: colors.border, borderRadius: 7, borderWidth: 1, color: colors.ink, fontSize: 13, minHeight: 94, padding: 10 },
  noteSave: { alignSelf: 'flex-start', backgroundColor: colors.brandDark, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 10 },
  noteSaveText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  noteStatus: { color: colors.sub, fontSize: 12, lineHeight: 17 },
})
