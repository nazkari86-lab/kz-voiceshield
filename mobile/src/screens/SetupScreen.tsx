import React from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { AccessibilityModule } from '@bridge/AccessibilityBridge'
import { CallModule } from '@bridge/CallModule'
import { OverlayModule } from '@bridge/OverlayBridge'

type Props = {
  modelReady: boolean
  onPrepareWhisper: () => void
}

const Step = ({ label, required, onPress }: { label: string; required?: boolean; onPress: () => void }) => (
  <Pressable accessibilityRole="button" onPress={onPress} style={styles.step}>
    <View>
      <Text style={styles.stepTitle}>{label}</Text>
      <Text style={styles.stepSub}>{required ? 'Required for call-time protection' : 'Optional fallback'}</Text>
    </View>
    <Text style={styles.chevron}>Open</Text>
  </Pressable>
)

export function SetupScreen({ modelReady, onPrepareWhisper }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>KZ VoiceShield setup</Text>
      <Text style={styles.copy}>Enable overlay, call screening and transcript sources before live protection.</Text>
      <Step label="Overlay permission" required onPress={() => OverlayModule.openOverlaySettings()} />
      <Step label="Call screening role" required onPress={() => { void CallModule.requestRole() }} />
      <Step label="Accessibility Live Caption reader" required onPress={() => AccessibilityModule.openSettings()} />
      <Step label={modelReady ? 'Whisper model ready' : 'Download Whisper model'} onPress={onPrepareWhisper} />
      <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings() }} style={styles.secondary}>
        <Text style={styles.secondaryText}>Open Android app settings</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  chevron: { color: '#0ea5b7', fontWeight: '800' },
  container: { gap: 14, padding: 20 },
  copy: { color: '#5f6b7a', fontSize: 14, lineHeight: 20 },
  secondary: { alignItems: 'center', borderColor: '#cbd5e1', borderRadius: 12, borderWidth: 1, padding: 14 },
  secondaryText: { color: '#0f172a', fontWeight: '700' },
  step: { alignItems: 'center', backgroundColor: '#f8fafc', borderColor: '#dbe4ef', borderRadius: 16, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  stepSub: { color: '#64748b', fontSize: 12, marginTop: 3 },
  stepTitle: { color: '#111827', fontSize: 15, fontWeight: '800' },
  title: { color: '#0f172a', fontSize: 28, fontWeight: '900' },
})
