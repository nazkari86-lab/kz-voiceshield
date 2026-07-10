import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'
import { Card, Metric, SectionTitle, ui } from './ui'
import { modelManifest } from '../data/modelManifest'

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
})
