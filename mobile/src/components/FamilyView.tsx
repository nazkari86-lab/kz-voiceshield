import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { TrustedContact } from '@hooks/useWorkspace'
import type { DeviceContact } from '../bridge/ContactsBridge'
import { colors } from '../theme'
import { MotionPressable } from './MotionPressable'
import { SectionHeader } from './ui'

type Props = {
  contact: TrustedContact | null
  privacyConsent: boolean
  onSave: (name: string, phone: string) => Promise<void>
  onClear: () => Promise<void>
  onCall: () => Promise<void>
  onShareAlert: () => Promise<void>
  onLoadContacts: () => Promise<DeviceContact[]>
}

export function FamilyView({ contact, privacyConsent, onSave, onClear, onCall, onShareAlert, onLoadContacts }: Props) {
  const [name, setName] = useState(contact?.name ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [status, setStatus] = useState('')
  const [contacts, setContacts] = useState<DeviceContact[]>([])

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

  const chooseContact = async () => {
    try {
      const next = await onLoadContacts()
      setContacts(next)
      setStatus(next.length ? 'Choose a contact below. Only the selected contact is saved.' : 'Contacts permission was not granted or no contacts were found.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not read contacts.')
    }
  }

  if (!privacyConsent) {
    return <View style={styles.locked}><Text style={styles.lockedEyebrow}>SETUP REQUIRED</Text><Text style={styles.lockedTitle}>Trusted contact is locked</Text><Text style={styles.lockedCopy}>Accept the privacy notice in Setup before storing a trusted contact.</Text></View>
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}><Text style={styles.heroEyebrow}>TRUSTED CIRCLE</Text><Text style={styles.heroTitle}>A second person for critical moments</Text><Text style={styles.heroCopy}>VoiceShield never contacts anyone automatically. Every call and warning is always under your control.</Text></View>
      {contact ? <View style={styles.savedCard}><View style={styles.avatar}><Text style={styles.avatarText}>{contact.name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.savedBody}><Text style={styles.savedEyebrow}>SAVED CONTACT</Text><Text style={styles.savedName}>{contact.name}</Text><Text style={styles.savedPhone}>{contact.phone}</Text></View><View style={styles.encrypted}><Text style={styles.encryptedText}>PRIVATE</Text></View></View> : null}
      <SectionHeader eyebrow={contact ? 'UPDATE CONTACT' : 'ADD CONTACT'} title={contact ? 'Keep details current' : 'Choose someone you trust'} detail="This contact appears only when you decide to call or send a risk summary." />
      <Text style={styles.fieldLabel}>FULL NAME</Text><TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={colors.muted} style={styles.input} />
      <Text style={styles.fieldLabel}>PHONE NUMBER</Text><TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Phone number" placeholderTextColor={colors.muted} style={styles.input} />
      <MotionPressable style={styles.secondary} onPress={() => { void chooseContact() }}><Text style={styles.secondaryText}>Choose from device contacts</Text></MotionPressable>
      {contacts.length > 0 && <View style={styles.contactList}>{contacts.map((item) => <Pressable key={`${item.id}-${item.phone}`} style={styles.contactRow} onPress={() => { setName(item.name); setPhone(item.phone); setContacts([]); setStatus('Contact selected. Save it to add it to Family Protection.') }}><Text style={styles.contactName}>{item.name}</Text><Text style={styles.contactPhone}>{item.phone}</Text></Pressable>)}</View>}
      <View style={styles.row}>
        <MotionPressable style={styles.primary} onPress={() => { void save() }}><Text style={styles.primaryText}>{contact ? 'Update contact' : 'Save contact'}</Text></MotionPressable>
        {contact && <MotionPressable style={styles.secondary} onPress={() => { void onCall() }}><Text style={styles.secondaryText}>Call now</Text></MotionPressable>}
        {contact && <MotionPressable style={styles.secondary} onPress={() => { void onShareAlert() }}><Text style={styles.secondaryText}>Share alert</Text></MotionPressable>}
      </View>
      {contact && <MotionPressable style={styles.danger} onPress={() => { void onClear() }}><Text style={styles.dangerText}>Remove trusted contact</Text></MotionPressable>}
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 11 },
  hero: { backgroundColor: colors.brandDark, borderRadius: 8, gap: 6, padding: 18 }, heroEyebrow: { color: '#9ce1c1', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, heroTitle: { color: '#fff', fontSize: 22, fontWeight: '900' }, heroCopy: { color: '#d7eee2', fontSize: 13, lineHeight: 19 },
  savedCard: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 11, padding: 14 }, avatar: { alignItems: 'center', backgroundColor: colors.softBrand, borderRadius: 8, height: 42, justifyContent: 'center', width: 42 }, avatarText: { color: colors.brandDark, fontSize: 18, fontWeight: '900' }, savedBody: { flex: 1 }, savedEyebrow: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 }, savedName: { color: colors.ink, fontSize: 16, fontWeight: '900', marginTop: 2 }, savedPhone: { color: colors.sub, fontSize: 12, marginTop: 1 }, encrypted: { backgroundColor: colors.chipBg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 }, encryptedText: { color: colors.brandDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  fieldLabel: { color: colors.sub, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginBottom: -5 },
  input: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.ink, paddingHorizontal: 13, paddingVertical: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primary: { backgroundColor: colors.brand, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11 },
  primaryText: { color: '#fff', fontWeight: '900' },
  secondary: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
  secondaryText: { color: colors.ink, fontWeight: '800' },
  contactList: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, maxHeight: 240 },
  contactRow: { borderBottomColor: colors.border, borderBottomWidth: 1, padding: 11 },
  contactName: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  contactPhone: { color: colors.sub, fontSize: 11, marginTop: 2 },
  danger: { alignSelf: 'flex-start', paddingVertical: 8 },
  dangerText: { color: '#dc2626', fontWeight: '800' },
  status: { color: colors.sub, fontSize: 12 },
  locked: { backgroundColor: colors.chipBg, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 5, padding: 16 }, lockedEyebrow: { color: colors.brand, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, lockedTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' }, lockedCopy: { color: colors.sub, fontSize: 13, lineHeight: 19 },
})
