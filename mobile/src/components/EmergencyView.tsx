import React, { useEffect, useState } from 'react'
import { Share, StyleSheet, View } from 'react-native'
import { emergencyMessage, recoveryPlans, type EmergencyRecipient, type ExposureType } from '../emergency'
import { colors } from '../theme'
import { MotionPressable } from './MotionPressable'
import { SectionHeader } from './ui'
import { LocalizedText as Text } from './LocalizedText'
import type { OnDeviceAiRuntime } from '../hooks/useOnDeviceAiRuntime'
import { AiAssistButton } from './AiAssistButton'

type Props = { trustedContactName?: string; onCallTrusted: () => void; onOpenVerify: () => void; ai?: OnDeviceAiRuntime }

export function EmergencyView({ trustedContactName, onCallTrusted, onOpenVerify, ai }: Props) {
  const [selected, setSelected] = useState<ExposureType | null>(null)
  const [completed, setCompleted] = useState<number[]>([])
  const [timerActive, setTimerActive] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(15 * 60)
  const plan = recoveryPlans.find((item) => item.id === selected)
  useEffect(() => {
    if (!timerActive || secondsLeft <= 0) return
    const timer = setInterval(() => setSecondsLeft((current) => current - 1), 1000)
    return () => clearInterval(timer)
  }, [secondsLeft, timerActive])
  const shareTemplate = (recipient: EmergencyRecipient) => { void Share.share({ title: 'VoiceShield recovery message', message: emergencyMessage(recipient) }) }
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const seconds = String(secondsLeft % 60).padStart(2, '0')

  return <View style={styles.container}>
    <View style={styles.hero}>
      <Text style={styles.heroEyebrow}>RECOVERY MODE</Text>
      <Text style={styles.heroTitle}>Secure your accounts now</Text>
      <Text style={styles.heroCopy}>End the call first. Select what was exposed, then complete the official recovery steps in order.</Text>
    </View>
    <View style={styles.timerCard}><View><Text style={styles.timerTitle}>15-minute response window</Text><Text style={styles.timerCopy}>Use this as a private checklist timer. It does not contact a bank or anyone else automatically.</Text></View><MotionPressable style={styles.timerButton} onPress={() => { if (secondsLeft <= 0) setSecondsLeft(15 * 60); setTimerActive((current) => !current) }}><Text style={styles.timerValue}>{minutes}:{seconds}</Text><Text style={styles.timerLabel}>{timerActive ? 'PAUSE' : secondsLeft <= 0 ? 'RESET' : 'START'}</Text></MotionPressable></View>
    {!plan ? <>
      <SectionHeader eyebrow="CHOOSE EXPOSURE" title="What did you share?" detail="Each plan is ordered by urgency and starts with the fastest damage-control step." />
      {recoveryPlans.map((item, index) => <MotionPressable key={item.id} style={styles.item} onPress={() => { setSelected(item.id); setCompleted([]) }}><View style={styles.index}><Text style={styles.indexText}>{index + 1}</Text></View><View style={styles.itemBody}><Text style={styles.itemTitle}>{item.title}</Text><Text style={styles.itemCopy}>Open immediate recovery checklist</Text><Text style={styles.urgency}>{item.urgency}</Text></View><Text style={styles.arrow}>›</Text></MotionPressable>)}
    </> : <>
      <View style={styles.planHeader}><View style={styles.planTitle}><Text style={styles.planEyebrow}>ACTIVE RECOVERY PLAN</Text><Text style={styles.itemTitle}>{plan.title}</Text><Text style={styles.urgency}>{plan.urgency}</Text></View><MotionPressable style={styles.changeButton} onPress={() => setSelected(null)}><Text style={styles.change}>Change</Text></MotionPressable></View>
      <View style={styles.progressCard}><View style={styles.progressTop}><Text style={styles.progressLabel}>CHECKLIST PROGRESS</Text><Text style={styles.progressValue}>{completed.length}/{plan.steps.length}</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${(completed.length / plan.steps.length) * 100}%` }]} /></View><Text style={styles.progressCopy}>{completed.length === plan.steps.length ? 'Initial recovery is complete. Keep monitoring account activity.' : 'Mark each action only after it is completed.'}</Text></View>
      {plan.steps.map((step, index) => {
        const done = completed.includes(index)
        return <MotionPressable key={step} style={[styles.step, done && styles.stepDone]} onPress={() => setCompleted((current) => done ? current.filter((value) => value !== index) : [...current, index])}><Text style={[styles.checkbox, done && styles.checkboxDone]}>{done ? '✓' : index + 1}</Text><View style={styles.stepBody}><Text style={styles.stepLabel}>STEP {index + 1}</Text><Text style={[styles.stepText, done && styles.stepTextDone]}>{step}</Text></View></MotionPressable>
      })}
      <View style={styles.actions}><MotionPressable style={styles.primary} onPress={onOpenVerify}><Text style={styles.primaryText}>Open official contacts</Text></MotionPressable>{trustedContactName ? <MotionPressable style={styles.secondary} onPress={onCallTrusted}><Text style={styles.secondaryText}>Call {trustedContactName}</Text></MotionPressable> : null}</View>
      <View style={styles.templateCard}><Text style={styles.templateTitle}>Ready-to-send report text</Text><Text style={styles.templateCopy}>A template includes only your selected wording and current time. Review it before sending.</Text><View style={styles.actions}><MotionPressable style={styles.secondary} onPress={() => shareTemplate('bank')}><Text style={styles.secondaryText}>Bank</Text></MotionPressable><MotionPressable style={styles.secondary} onPress={() => shareTemplate('operator')}><Text style={styles.secondaryText}>Mobile operator</Text></MotionPressable><MotionPressable style={styles.secondary} onPress={() => shareTemplate('finpol')}><Text style={styles.secondaryText}>FinPol</Text></MotionPressable></View></View>
      {ai && <AiAssistButton ai={ai} context={`Emergency recovery plan: ${plan.title}. Urgency: ${plan.urgency}. Official steps: ${plan.steps.join('; ')}`} label="Попросить AI объяснить план" />}
    </>}
  </View>
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  hero: { backgroundColor: colors.brandDark, borderRadius: 8, gap: 6, marginBottom: 4, padding: 18 },
  heroEyebrow: { color: '#9ce1c1', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, heroTitle: { color: '#fff', fontSize: 23, fontWeight: '900' }, heroCopy: { color: '#d7eee2', fontSize: 13, lineHeight: 19 },
  timerCard: { alignItems: 'center', backgroundColor: '#fff7ed', borderColor: '#fdba74', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'space-between', padding: 13 }, timerTitle: { color: '#9a3412', fontSize: 13, fontWeight: '900' }, timerCopy: { color: '#7c2d12', flex: 1, fontSize: 11, lineHeight: 16, marginTop: 3 }, timerButton: { alignItems: 'center', backgroundColor: '#c2410c', borderRadius: 8, minWidth: 76, paddingHorizontal: 9, paddingVertical: 8 }, timerValue: { color: '#fff', fontSize: 17, fontWeight: '900' }, timerLabel: { color: '#ffedd5', fontSize: 9, fontWeight: '900', marginTop: 2 },
  item: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 14 },
  index: { alignItems: 'center', backgroundColor: colors.softDanger, borderRadius: 8, height: 34, justifyContent: 'center', width: 34 }, indexText: { color: '#a43239', fontSize: 14, fontWeight: '900' }, itemBody: { flex: 1, gap: 2 },
  itemTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' }, itemCopy: { color: colors.sub, fontSize: 12 }, urgency: { color: '#b23638', fontSize: 10, fontWeight: '900', letterSpacing: 0.5, marginTop: 3 },
  arrow: { color: colors.brand, fontSize: 28 }, planHeader: { alignItems: 'flex-start', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 14 }, planTitle: { flex: 1, gap: 3 }, planEyebrow: { color: colors.brand, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }, changeButton: { borderColor: colors.border, borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 }, change: { color: colors.brandDark, fontSize: 12, fontWeight: '900' },
  progressCard: { backgroundColor: colors.chipBg, borderRadius: 8, gap: 7, padding: 13 }, progressTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, progressLabel: { color: colors.sub, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 }, progressValue: { color: colors.brandDark, fontSize: 14, fontWeight: '900' }, track: { backgroundColor: '#c9dad0', borderRadius: 4, height: 7, overflow: 'hidden' }, fill: { backgroundColor: colors.brand, height: 7 }, progressCopy: { color: colors.sub, fontSize: 11, lineHeight: 16 },
  step: { alignItems: 'flex-start', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 11, padding: 13 }, stepDone: { backgroundColor: '#f0faf4', borderColor: '#9fd7b5' }, checkbox: { backgroundColor: colors.brandDark, borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: '900', height: 26, lineHeight: 26, textAlign: 'center', width: 26 }, checkboxDone: { backgroundColor: colors.brand }, stepBody: { flex: 1, gap: 2 }, stepLabel: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 }, stepText: { color: colors.ink, fontSize: 13, lineHeight: 19 }, stepTextDone: { color: colors.sub }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  primary: { backgroundColor: colors.brand, borderRadius: 8, flexGrow: 1, paddingHorizontal: 14, paddingVertical: 12 }, primaryText: { color: '#fff', fontWeight: '900', textAlign: 'center' },
  secondary: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexGrow: 1, paddingHorizontal: 14, paddingVertical: 12 }, secondaryText: { color: colors.ink, fontWeight: '800', textAlign: 'center' },
  templateCard: { backgroundColor: '#f8fafc', borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 6, padding: 12 }, templateTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' }, templateCopy: { color: colors.sub, fontSize: 11, lineHeight: 16 },
})
