import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { analyzeTranscript, sampleMeta, samples } from '@scoring'
import { colors, riskColor } from '../theme'

type Props = { onLoadScenario: (key: keyof typeof samples, label: string) => void }

export function SimulatorView({ onLoadScenario }: Props) {
  return (
    <View>
      <Text style={styles.hint}>Tap a scenario to load it into the Live tab and see the full analysis.</Text>
      {sampleMeta.map(([key, label]) => {
        const result = analyzeTranscript(samples[key])
        return (
          <Pressable
            key={key}
            style={[styles.item, { borderLeftColor: riskColor[result.risk] }]}
            onPress={() => onLoadScenario(key, label)}
          >
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.meta}>{result.score}/100 · {result.verdict}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  hint: { color: colors.sub, fontSize: 12, marginBottom: 10 },
  item: {
    backgroundColor: colors.card, borderColor: colors.border, borderLeftWidth: 5, borderRadius: 14,
    borderWidth: 1, gap: 3, marginBottom: 10, padding: 14,
  },
  label: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  meta: { color: colors.sub, fontSize: 12 },
})
