import React, { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { colors } from '../theme'
import { Card, Metric, SectionTitle, ui } from './ui'
import { modelManifest } from '../data/modelManifest'
import { kazakhQualityPackComponents } from '../data/kazakhQualityPack'
import { whisperModels } from '../data/whisperModels'
import { LocalizedText as Text } from './LocalizedText'
import { buildKnowledgeGraph, personalizedRecommendations, relatedKnowledge, searchKnowledge, type KnowledgeNode } from '../data/knowledgeGraph'
import { ModelDownloader } from '../bridge/WhisperBridge'
import { getKnowledgeBackendConfig, loadKnowledgeGraphState, mergeKnowledgeGraph, pullKnowledgeGraph, saveKnowledgeGraphState, setKnowledgeBackendConfig, syncKnowledgeGraph, type KnowledgeGraphState } from '../data/knowledgeGraphStore'

export function ModelView() {
  const { activeDetector, ml, privacy } = modelManifest
  const snap = ml.trainedOn
  const origins = Object.entries(snap.byOrigin ?? {})
  const langs = Object.entries(snap.byLanguage ?? {})
  const [query, setQuery] = useState('')
  const [graphState, setGraphState] = useState<KnowledgeGraphState>({ notes: [], customEdges: [], diagnostics: [], updatedAt: new Date(0).toISOString() })
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof ModelDownloader.getStorageInfo>> | null>(null)
  const [readyModels, setReadyModels] = useState<Set<string>>(new Set())
  const [noteText, setNoteText] = useState('')
  const [edgeFrom, setEdgeFrom] = useState('')
  const [edgeTo, setEdgeTo] = useState('')
  const [edgeRelation, setEdgeRelation] = useState('supports')
  const [backendUrl, setBackendUrl] = useState('')
  const [backendToken, setBackendToken] = useState('')
  const [syncStatus, setSyncStatus] = useState('')
  useEffect(() => {
    let alive = true
    void Promise.all([loadKnowledgeGraphState(), getKnowledgeBackendConfig(), ModelDownloader.getStorageInfo(), ...whisperModels.map(async (model) => ({ id: model.id, path: await ModelDownloader.getVerifiedModelPath(model.file, model.sha256, model.size) }))])
      .then(([state, info, ...models]) => {
        if (!alive) return
        setGraphState(state as KnowledgeGraphState)
        const config = info as { url: string; token: string }
        setBackendUrl(config.url); setBackendToken(config.token)
        setStorage(models.shift() as Awaited<ReturnType<typeof ModelDownloader.getStorageInfo>>)
        setReadyModels(new Set((models as Array<{ id: string; path: string | null }>).filter((model) => model.path).map((model) => model.id)))
      }).catch(() => undefined)
    return () => { alive = false }
  }, [])
  const baseGraph = useMemo(() => buildKnowledgeGraph(storage, readyModels), [readyModels, storage])
  const graph = useMemo(() => mergeKnowledgeGraph(baseGraph, graphState), [baseGraph, graphState])
  const graphResults = useMemo(() => searchKnowledge(graph, query).filter((node) => node.type !== 'app').slice(0, 12), [graph, query])
  const recommendations = useMemo(() => personalizedRecommendations(graph, graphState.diagnostics, storage, readyModels), [graph, graphState.diagnostics, readyModels, storage])
  const statusLabel = (node: KnowledgeNode) => node.status === 'active' ? 'ACTIVE' : node.status === 'ready' ? 'READY' : node.status === 'available' ? 'AVAILABLE' : node.status === 'downloadable' ? 'DOWNLOAD' : node.status === 'experimental' ? 'EXPERIMENTAL' : 'BLOCKED'
  const addNote = async () => {
    const text = noteText.trim()
    if (!text) return
    const note: KnowledgeNode = { id: `note:${Date.now()}`, type: 'advice', title: 'User note', summary: text, tags: ['user', 'note'], status: 'active' }
    const next = { ...graphState, notes: [note, ...graphState.notes].slice(0, 100), updatedAt: new Date().toISOString() }
    await saveKnowledgeGraphState(next); setGraphState(next); setNoteText('')
  }
  const addEdge = async () => {
    const from = edgeFrom.trim(); const to = edgeTo.trim(); const relation = edgeRelation.trim()
    if (!from || !to || !relation) return
    const next = { ...graphState, customEdges: [...graphState.customEdges, { from, to, relation }].slice(-200), updatedAt: new Date().toISOString() }
    await saveKnowledgeGraphState(next); setGraphState(next); setEdgeFrom(''); setEdgeTo('')
  }
  const syncGraph = async () => {
    try {
      const remote = await pullKnowledgeGraph()
      const merged = remote ?? graphState
      if (remote) { setGraphState(merged) }
      const result = await syncKnowledgeGraph(baseGraph, merged)
      setSyncStatus(`Synced ${new Date(result.syncedAt).toLocaleString()}`)
    }
    catch (error) { setSyncStatus(error instanceof Error && error.message === 'BACKEND_NOT_CONFIGURED' ? 'Backend URL and token are required' : (error instanceof Error ? error.message : 'Sync failed')) }
  }

  return (
    <View>
      <SectionTitle>Knowledge graph</SectionTitle>
      <Card tone="low">
        <Text style={styles.body}>Version {graph.schemaVersion} · app {graph.appVersion} · {graph.nodes.length} nodes · {graph.edges.length} links</Text>
        {storage && <Text style={styles.meta}>Device: {Math.round(storage.availableBytes / 1024 ** 3 * 10) / 10} GB free · {Math.round(storage.ramBytes / 1024 ** 3 * 10) / 10} GB RAM · {readyModels.size} verified models ready</Text>}
        <TextInput value={query} onChangeText={setQuery} placeholder="Search models, functions, datasets or advice" placeholderTextColor={colors.muted} style={styles.search} />
        <TextInput value={noteText} onChangeText={setNoteText} placeholder="Add a private note or device finding" placeholderTextColor={colors.muted} style={styles.search} />
        <Pressable style={styles.graphButton} onPress={() => { void addNote() }}><Text style={styles.graphButtonText}>Add encrypted note</Text></Pressable>
        <TextInput value={edgeFrom} onChangeText={setEdgeFrom} placeholder="Connection from node id" placeholderTextColor={colors.muted} autoCapitalize="none" style={styles.search} />
        <TextInput value={edgeTo} onChangeText={setEdgeTo} placeholder="Connection to node id" placeholderTextColor={colors.muted} autoCapitalize="none" style={styles.search} />
        <View style={styles.graphActions}><TextInput value={edgeRelation} onChangeText={setEdgeRelation} placeholder="Relation" placeholderTextColor={colors.muted} style={[styles.search, styles.relationInput]} /><Pressable style={styles.graphButton} onPress={() => { void addEdge() }}><Text style={styles.graphButtonText}>Add connection</Text></Pressable></View>
        <TextInput value={backendUrl} onChangeText={setBackendUrl} placeholder="Backend URL (optional)" placeholderTextColor={colors.muted} autoCapitalize="none" style={styles.search} />
        <TextInput value={backendToken} onChangeText={setBackendToken} placeholder="Backend token (stored encrypted)" placeholderTextColor={colors.muted} secureTextEntry autoCapitalize="none" style={styles.search} />
        <View style={styles.graphActions}><Pressable style={styles.graphButton} onPress={() => { void setKnowledgeBackendConfig(backendUrl, backendToken); setSyncStatus('Backend settings saved encrypted') }}><Text style={styles.graphButtonText}>Save backend</Text></Pressable><Pressable style={styles.graphButton} onPress={() => { void syncGraph() }}><Text style={styles.graphButtonText}>Sync graph</Text></Pressable></View>
        {!!syncStatus && <Text style={styles.meta}>{syncStatus}</Text>}
        {recommendations.length > 0 && <View style={styles.recommendation}><Text style={styles.subhead}>Personal recommendations</Text>{recommendations.map((node) => <Text key={node.id} style={styles.body}>• {node.title}: {node.summary}</Text>)}</View>}
        {graphResults.map((node) => {
          const related = relatedKnowledge(graph, node.id).slice(0, 2)
          return (
            <View key={node.id} style={styles.graphRow}>
              <View style={styles.graphCopy}>
                <Text style={styles.title}>{node.title}</Text>
                <Text style={styles.meta}>{node.type.toUpperCase()} · {statusLabel(node)}{node.version ? ` · v${node.version}` : ''}</Text>
                <Text style={styles.body}>{node.summary}</Text>
                {related.length > 0 && <Text style={styles.graphLinks}>Связи: {related.map((item) => item.title).join(' · ')}</Text>}
              </View>
            </View>
          )
        })}
      </Card>
      <SectionTitle>Active detector</SectionTitle>
      <Card>
        <Text style={styles.title}>{activeDetector.name}</Text>
        <Text style={styles.meta}>{activeDetector.ruleCount} rules · {activeDetector.machineLearned ? 'machine-learned' : 'deterministic, not ML'}</Text>
        <Text style={styles.body}>{activeDetector.note}</Text>
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
  search: { backgroundColor: '#fff', borderColor: '#d6e4df', borderRadius: 8, borderWidth: 1, color: colors.ink, fontSize: 14, marginVertical: 10, paddingHorizontal: 12, paddingVertical: 10 },
  graphRow: { borderTopColor: '#dce9e4', borderTopWidth: 1, paddingVertical: 10 },
  graphCopy: { gap: 3 },
  graphLinks: { color: colors.brandDark, fontSize: 11, lineHeight: 16 },
  graphActions: { flexDirection: 'row', gap: 8 },
  graphButton: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: 8, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 9 },
  graphButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  recommendation: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0', borderRadius: 8, borderWidth: 1, gap: 4, marginBottom: 8, padding: 10 },
  relationInput: { flex: 1, marginVertical: 0 },
})
