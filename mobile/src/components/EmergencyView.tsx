import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { recoveryPlans, type ExposureType } from '../emergency'
import { colors } from '../theme'

type Props = { trustedContactName?: string; onCallTrusted: () => void; onOpenVerify: () => void }

export function EmergencyView({ trustedContactName, onCallTrusted, onOpenVerify }: Props) {
  const [selected, setSelected] = useState<ExposureType | null>(null)
  const [completed, setCompleted] = useState<number[]>([])
  const plan = recoveryPlans.find((item) => item.id === selected)

  return <View style={styles.container}>
    <Text style={styles.title}>I already shared information</Text>
    <Text style={styles.warning}>Stop contact with the caller. Choose what was exposed and complete every action in order.</Text>
    {!plan ? recoveryPlans.map((item) => <Pressable key={item.id} style={styles.item} onPress={() => { setSelected(item.id); setCompleted([]) }}><View><Text style={styles.itemTitle}>{item.title}</Text><Text style={styles.urgency}>{item.urgency}</Text></View><Text style={styles.arrow}>›</Text></Pressable>) : <>
      <View style={styles.planHeader}><View><Text style={styles.itemTitle}>{plan.title}</Text><Text style={styles.urgency}>{plan.urgency}</Text></View><Pressable onPress={() => setSelected(null)}><Text style={styles.change}>Change</Text></Pressable></View>
      {plan.steps.map((step, index) => {
        const done = completed.includes(index)
        return <Pressable key={step} style={[styles.step, done && styles.stepDone]} onPress={() => setCompleted((current) => done ? current.filter((value) => value !== index) : [...current, index])}><Text style={styles.checkbox}>{done ? '✓' : index + 1}</Text><Text style={styles.stepText}>{step}</Text></Pressable>
      })}
      <View style={styles.actions}><Pressable style={styles.primary} onPress={onOpenVerify}><Text style={styles.primaryText}>Official contacts</Text></Pressable>{trustedContactName ? <Pressable style={styles.secondary} onPress={onCallTrusted}><Text style={styles.secondaryText}>Call {trustedContactName}</Text></Pressable> : null}</View>
      {completed.length === plan.steps.length ? <Text style={styles.complete}>Immediate checklist completed. Continue monitoring accounts and preserve evidence.</Text> : null}
    </>}
  </View>
}

const styles = StyleSheet.create({
  container: { gap: 10 }, title: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  warning: { backgroundColor: '#fee2e2', borderColor: '#fca5a5', borderRadius: 8, borderWidth: 1, color: '#991b1b', fontSize: 13, lineHeight: 19, padding: 13 },
  item: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 14 },
  itemTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' }, urgency: { color: '#dc2626', fontSize: 11, fontWeight: '800', marginTop: 3 },
  arrow: { color: colors.muted, fontSize: 28 }, planHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, change: { color: colors.brand, fontWeight: '900' },
  step: { alignItems: 'flex-start', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 13 },
  stepDone: { backgroundColor: '#f0fdf4', borderColor: '#86efac' }, checkbox: { backgroundColor: colors.brand, borderRadius: 12, color: '#fff', fontSize: 12, fontWeight: '900', height: 24, lineHeight: 24, textAlign: 'center', width: 24 },
  stepText: { color: colors.ink, flex: 1, fontSize: 13, lineHeight: 19 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primary: { backgroundColor: colors.brand, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11 }, primaryText: { color: '#fff', fontWeight: '900' },
  secondary: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 }, secondaryText: { color: colors.ink, fontWeight: '800' },
  complete: { backgroundColor: '#f0fdf4', borderRadius: 8, color: '#166534', fontSize: 13, lineHeight: 19, padding: 13 },
})
