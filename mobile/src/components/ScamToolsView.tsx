import React, { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { analyzeScamContent } from '../scamTools'
import { colors, riskColor, riskLabel } from '../theme'
import { ImageScanModule } from '../bridge/ImageScanBridge'
import { MotionPressable } from './MotionPressable'

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
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>LOCAL CONTENT CHECK</Text>
        <Text style={styles.title}>Inspect before you open.</Text>
        <Text style={styles.heroCopy}>Paste a message, or scan a QR code or screenshot. The content stays on this device and links are never opened during review.</Text>
      </View>
      <TextInput
        accessibilityLabel="Message or link to check"
        multiline
        onChangeText={(value) => { setText(value); setChecked(false) }}
        placeholder="Paste SMS, WhatsApp, Telegram text or URL"
        placeholderTextColor={colors.muted}
        style={styles.input}
        maxLength={20000}
        textAlignVertical="top"
        value={text}
      />
      <View style={styles.modeRow}><Text style={styles.modeLabel}>TEXT OR LINK</Text><Text style={styles.modeHint}>{text.length}/20,000</Text></View>
      <View style={styles.row}>
        <MotionPressable onPress={() => setChecked(true)} style={styles.primary}><Text style={styles.primaryText}>Check safely</Text></MotionPressable>
        <MotionPressable onPress={() => onAnalyzeAsCall(text)} style={styles.secondary}><Text style={styles.secondaryText}>Open in call analysis</Text></MotionPressable>
      </View>
      <MotionPressable onPress={() => { void scanImage() }} style={styles.imageButton}><Text style={styles.imageButtonText}>Scan QR or screenshot</Text><Text style={styles.imageButtonSub}>Local OCR + QR extraction</Text></MotionPressable>
      {scanStatus ? <Text style={styles.scanStatus}>{scanStatus}</Text> : null}

      {checked && (
        <View style={[styles.result, { borderTopColor: riskColor[result.risk] }]}>
          <View style={styles.heading}>
            <View><Text style={styles.resultTitle}>{riskLabel[result.risk]}</Text><Text style={styles.scheme}>{result.schemeLabel}</Text></View>
            <Text style={[styles.score, { color: riskColor[result.risk] }]}>{result.score}</Text>
          </View>
          <View style={styles.resultMeta}><Text style={styles.meta}>{result.links.length} link(s) detected</Text><Text style={styles.meta}>{result.reasons.length} local signals</Text></View>
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
  hero: { backgroundColor: colors.brandDark, borderRadius: 8, gap: 7, padding: 18 },
  eyebrow: { color: '#8fe0bd', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: '#fff', fontSize: 23, fontWeight: '900' },
  heroCopy: { color: '#c1dfd0', fontSize: 13, lineHeight: 19 },
  input: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.ink, fontSize: 14, minHeight: 150, padding: 13 },
  modeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  modeLabel: { color: colors.sub, fontSize: 10, fontWeight: '900', letterSpacing: 0.9 },
  modeHint: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primary: { backgroundColor: colors.brand, borderRadius: 8, paddingHorizontal: 15, paddingVertical: 11 },
  primaryText: { color: '#fff', fontWeight: '900' },
  secondary: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 11 },
  secondaryText: { color: colors.ink, fontWeight: '800' },
  imageButton: { backgroundColor: colors.softBrand, borderColor: '#a7d8be', borderRadius: 8, borderWidth: 1, gap: 2, paddingHorizontal: 15, paddingVertical: 12 },
  imageButtonText: { color: colors.brandDark, fontWeight: '900' },
  imageButtonSub: { color: colors.sub, fontSize: 11 },
  scanStatus: { color: colors.sub, fontSize: 12, lineHeight: 18 },
  result: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderTopWidth: 4, borderWidth: 1, gap: 8, padding: 14 },
  heading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  resultTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  scheme: { color: colors.sub, fontSize: 11, marginTop: 2 },
  score: { fontSize: 28, fontWeight: '900' },
  meta: { color: colors.sub, fontSize: 11 },
  resultMeta: { flexDirection: 'row', gap: 10 },
  reason: { color: '#334155', fontSize: 12, lineHeight: 18 },
  safe: { color: '#166534', fontSize: 12, lineHeight: 18 },
  limitations: { backgroundColor: '#f8fafc', borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 5, padding: 13 },
  limitTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  limitText: { color: colors.sub, fontSize: 12, lineHeight: 18 },
})
