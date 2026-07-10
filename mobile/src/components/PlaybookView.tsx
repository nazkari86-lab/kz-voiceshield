import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'
import { Card } from './ui'

const STEPS: Array<{ icon: string; title: string; body: string; tag: string }> = [
  { icon: '🛑', title: '1. Freeze action immediately', tag: 'First response', body: 'Stop all money transfers, code sharing, screen-sharing sessions and app installs. Every second of delay gives the attacker more control. Hang up — do not stay on the line.' },
  { icon: '📞', title: '2. Verify through a saved number', tag: 'Caller ID spoof', body: 'Caller ID can be faked to show a real bank or government number. End the call and redial using the number on the back of your card, the official website, or a number you wrote down before. Never trust the number that called you.' },
  { icon: '📱', title: '3. Watch for SMS follow-ups', tag: 'Smishing bridge', body: 'Multi-channel attacks use SMS or messaging apps as a second trust layer. A text that arrives right after a call — confirming the caller\'s story — is part of the same scam. Legitimate banks do not ask you to respond to SMS codes they sent.' },
  { icon: '🎭', title: '4. Resist pretexting scripts', tag: 'Pretexting', body: 'Scammers fabricate a background story (you applied for a loan, your relative is in trouble, you owe taxes). Ask yourself: did I initiate this contact? If not, hang up.' },
  { icon: '⚠️', title: '5. Never share OTP or seed phrases', tag: 'Extraction stage', body: 'One-time passwords and crypto seed phrases are single-use secrets. Any caller asking for an OTP to "confirm" or "cancel" a transaction is hijacking your account. No legitimate bank, exchange or support agent ever needs your OTP.' },
  { icon: '🔒', title: '6. Secure compromised accounts', tag: 'Post-compromise', body: 'If you shared a code or password: change credentials immediately, end all active sessions, check connected devices in messenger settings, contact your bank to freeze the card. Enable two-factor authentication on recovery methods.' },
  { icon: '🌐', title: '7. Do not follow unverified links', tag: 'Phishing site', body: 'Attackers send links that mimic real bank or government portals. Check the domain carefully — one wrong letter means a phishing site. Bookmark official portals; navigate to them manually.' },
  { icon: '📢', title: '8. Report the incident', tag: 'Reporting', body: 'Report fraud attempts to your bank, the national cybercrime hotline (102 in Kazakhstan), and the Financial Monitoring Agency if money moved. Your report helps block attacker infrastructure and warn others.' },
  { icon: '🗂', title: '9. Preserve evidence', tag: 'Documentation', body: 'Export this VoiceShield report, keep screenshots of SMS/chat messages, note caller phone numbers, timestamps, and any link URLs. Evidence is required for criminal reports and bank disputes.' },
]

export function PlaybookView() {
  return (
    <View>
      {STEPS.map((step) => (
        <Card key={step.title}>
          <View style={styles.head}>
            <Text style={styles.icon}>{step.icon}</Text>
            <Text style={styles.title}>{step.title}</Text>
          </View>
          <Text style={styles.tag}>{step.tag}</Text>
          <Text style={styles.body}>{step.body}</Text>
        </Card>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  icon: { fontSize: 18 },
  title: { color: colors.ink, flex: 1, fontSize: 14, fontWeight: '900' },
  tag: { alignSelf: 'flex-start', backgroundColor: colors.chipBg, borderRadius: 999, color: colors.sub, fontSize: 11, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2 },
  body: { color: '#334155', fontSize: 13, lineHeight: 19 },
})
