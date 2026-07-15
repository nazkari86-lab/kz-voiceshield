import React from 'react'
import { StyleSheet, View } from 'react-native'
import { colors } from '../theme'
import { Card, Metric, SectionTitle, ui } from './ui'
import { modelManifest } from '../data/modelManifest'
import { kazakhQualityPackComponents } from '../data/kazakhQualityPack'
import { LocalizedText as Text } from './LocalizedText'

export function ModelView() {
  const { activeDetector, ml, privacy } = modelManifest
  const snap = ml.trainedOn
  const origins = Object.entries(snap.byOrigin ?? {})
  const langs = Object.entries(snap.byLanguage ?? {})

  return (
    <View>
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
})
