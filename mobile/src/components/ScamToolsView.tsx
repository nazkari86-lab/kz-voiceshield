import React, { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { analyzeScamContent } from '../scamTools'
import { colors, riskColor, riskLabel } from '../theme'
import { ImageScanModule } from '../bridge/ImageScanBridge'

export function ScamToolsView({ initialText, onAnalyzeAsCall }: { initialText?: string; onAnalyzeAsCall: (text: string) => void }) {
  const [text, setText] = useState(initialText ?? '')
  const [checked, setChecked] = useState(false)
  const [scanStatus, setScanStatus] = useState('')
  const result = useMemo(() => analyzeScamContent(checked ? text : ''), [checked, text])

  useEffect(() => {
    if (!initialText) return
    setText(initialText)
    setChecked(true)
  }, [initialText])

  const scanImage = async () => {
    if (!ImageScanModule) {
      setScanStatus('Image scanning is available in the Android app.')
      return
    }
    setScanStatus('Reading image on this device…')
    try {
      const result = await ImageScanModule.pickImageAndScan()
      const qr = result.qrValues.map((value) => `QR: ${value}`).join('\n')
      const combined = [qr, result.text].filter(Boolean).join('\n')
      setText(combined)
      setChecked(true)
      setScanStatus(combined ? 'Image scanned locally. Review the extracted content below.' : 'No QR code or readable text was found in this image.')
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (!code.includes('CANCELLED')) setScanStatus('Could not scan this image. Try a clearer screenshot.')
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scam Tools</Text>
      <Text style={styles.copy}>Paste an SMS, messenger message or suspicious link. Analysis stays on-device and does not open the link.</Text>
      <TextInput
        accessibilityLabel="Message or link to check"
        multiline
        onChangeText={(value) => { setText(value); setChecked(false) }}
        placeholder="Paste SMS, WhatsApp, Telegram text or URL"
        placeholderTextColor={colors.muted}
        style={styles.input}
        textAlignVertical="top"
        value={text}
      />
      <View style={styles.row}>
        <Pressable onPress={() => setChecked(true)} style={styles.primary}><Text style={styles.primaryText}>Check safely</Text></Pressable>
        <Pressable onPress={() => onAnalyzeAsCall(text)} style={styles.secondary}><Text style={styles.secondaryText}>Open in call analysis</Text></Pressable>
      </View>
      <Pressable onPress={() => { void scanImage() }} style={styles.imageButton}><Text style={styles.imageButtonText}>Scan QR or screenshot</Text></Pressable>
      {scanStatus ? <Text style={styles.scanStatus}>{scanStatus}</Text> : null}

      {checked && (
        <View style={[styles.result, { borderLeftColor: riskColor[result.risk] }]}>
          <View style={styles.heading}>
            <View><Text style={styles.resultTitle}>{riskLabel[result.risk]}</Text><Text style={styles.scheme}>{result.schemeLabel}</Text></View>
            <Text style={[styles.score, { color: riskColor[result.risk] }]}>{result.score}</Text>
          </View>
          <Text style={styles.meta}>{result.links.length} link(s) detected</Text>
          {result.reasons.length === 0
            ? <Text style={styles.safe}>No local phishing indicators found. This does not guarantee the sender is legitimate.</Text>
            : result.reasons.map((reason) => <Text key={reason} style={styles.reason}>• {reason}</Text>)}
        </View>
      )}

      <View style={styles.limitations}>
        <Text style={styles.limitTitle}>Local image scanning</Text>
        <Text style={styles.limitText}>QR codes and visible Latin/Cyrillic text are extracted on-device. APK reputation still needs a signed malware-intelligence provider.</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 11 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  copy: { color: colors.sub, fontSize: 13, lineHeight: 19 },
  input: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.ink, fontSize: 14, minHeight: 150, padding: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primary: { backgroundColor: colors.brand, borderRadius: 8, paddingHorizontal: 15, paddingVertical: 11 },
  primaryText: { color: '#fff', fontWeight: '900' },
  secondary: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 11 },
  secondaryText: { color: colors.ink, fontWeight: '800' },
  imageButton: { alignSelf: 'flex-start', borderColor: colors.brand, borderRadius: 8, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 11 },
  imageButtonText: { color: colors.brandDark, fontWeight: '900' },
  scanStatus: { color: colors.sub, fontSize: 12, lineHeight: 18 },
  result: { backgroundColor: colors.card, borderColor: colors.border, borderLeftWidth: 5, borderRadius: 8, borderWidth: 1, gap: 8, padding: 14 },
  heading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  resultTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  scheme: { color: colors.sub, fontSize: 11, marginTop: 2 },
  score: { fontSize: 28, fontWeight: '900' },
  meta: { color: colors.sub, fontSize: 11 },
  reason: { color: '#334155', fontSize: 12, lineHeight: 18 },
  safe: { color: '#166534', fontSize: 12, lineHeight: 18 },
  limitations: { backgroundColor: '#f8fafc', borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 5, padding: 13 },
  limitTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  limitText: { color: colors.sub, fontSize: 12, lineHeight: 18 },
})
