import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { TrustedContact } from '@hooks/useWorkspace'
import { colors } from '../theme'

type Props = {
  contact: TrustedContact | null
  privacyConsent: boolean
  onSave: (name: string, phone: string) => Promise<void>
  onClear: () => Promise<void>
  onCall: () => Promise<void>
  onShareAlert: () => Promise<void>
}

export function FamilyView({ contact, privacyConsent, onSave, onClear, onCall, onShareAlert }: Props) {
  const [name, setName] = useState(contact?.name ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [status, setStatus] = useState('')

  useEffect(() => {
    setName(contact?.name ?? '')
    setPhone(contact?.phone ?? '')
  }, [contact])

  const save = async () => {
    try {
      await onSave(name, phone)
      setStatus('Trusted contact saved in encrypted storage.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save trusted contact.')
    }
  }

  if (!privacyConsent) {
    return <Text style={styles.notice}>Accept the privacy notice in Setup before storing a trusted contact.</Text>
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trusted family contact</Text>
      <Text style={styles.copy}>VoiceShield never contacts this person automatically. Calls and warning summaries always require your action.</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={colors.muted} style={styles.input} />
      <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Phone number" placeholderTextColor={colors.muted} style={styles.input} />
      <View style={styles.row}>
        <Pressable style={styles.primary} onPress={() => { void save() }}><Text style={styles.primaryText}>Save contact</Text></Pressable>
        {contact && <Pressable style={styles.secondary} onPress={() => { void onCall() }}><Text style={styles.secondaryText}>Call {contact.name}</Text></Pressable>}
        {contact && <Pressable style={styles.secondary} onPress={() => { void onShareAlert() }}><Text style={styles.secondaryText}>Share risk alert</Text></Pressable>}
      </View>
      {contact && <Pressable style={styles.danger} onPress={() => { void onClear() }}><Text style={styles.dangerText}>Remove trusted contact</Text></Pressable>}
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 11 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  copy: { color: colors.sub, fontSize: 13, lineHeight: 19 },
  input: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.ink, paddingHorizontal: 13, paddingVertical: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primary: { backgroundColor: colors.brand, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11 },
  primaryText: { color: '#fff', fontWeight: '900' },
  secondary: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
  secondaryText: { color: colors.ink, fontWeight: '800' },
  danger: { alignSelf: 'flex-start', paddingVertical: 8 },
  dangerText: { color: '#dc2626', fontWeight: '800' },
  status: { color: colors.sub, fontSize: 12 },
  notice: { backgroundColor: '#fff7ed', borderRadius: 8, color: '#9a3412', fontSize: 13, lineHeight: 19, padding: 14 },
})
