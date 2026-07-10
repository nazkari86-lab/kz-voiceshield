import React from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { officialOrganizations } from '../data/officialOrganizations'
import { colors } from '../theme'

export function VerifyView() {
  return (
    <View>
      <Text style={styles.title}>Verify through an official channel</Text>
      <Text style={styles.warning}>End the incoming call first. Caller ID can be spoofed. Never call back using the number that contacted you.</Text>
      {officialOrganizations.map((organization) => (
        <View key={organization.id} style={styles.item}>
          <View style={styles.heading}>
            <Text style={styles.name}>{organization.name}</Text>
            <Text style={styles.date}>Checked {organization.verifiedAt}</Text>
          </View>
          <Text style={styles.phone}>{organization.phone}</Text>
          <View style={styles.row}>
            <Pressable style={styles.primary} onPress={() => { void Linking.openURL(`tel:${organization.phone}`) }}><Text style={styles.primaryText}>Call official number</Text></Pressable>
            <Pressable style={styles.secondary} onPress={() => { void Linking.openURL(organization.website) }}><Text style={styles.secondaryText}>Open official site</Text></Pressable>
          </View>
          <Text style={styles.source}>Source: {organization.source}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 22, fontWeight: '900', marginBottom: 8 },
  warning: { backgroundColor: '#fff7ed', borderColor: '#fdba74', borderRadius: 8, borderWidth: 1, color: '#9a3412', fontSize: 13, lineHeight: 19, marginBottom: 12, padding: 13 },
  item: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 9, marginBottom: 10, padding: 14 },
  heading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  name: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  date: { color: colors.muted, fontSize: 10 },
  phone: { color: colors.brand, fontSize: 24, fontWeight: '900' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primary: { backgroundColor: colors.brand, borderRadius: 8, paddingHorizontal: 13, paddingVertical: 10 },
  primaryText: { color: '#fff', fontWeight: '900' },
  secondary: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10 },
  secondaryText: { color: colors.ink, fontWeight: '800' },
  source: { color: colors.muted, fontSize: 10 },
})
