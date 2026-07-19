import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { createFamily, createFamilyInvite, getAccountSession, joinFamily, loadAccount, logoutAccount, registerDeviceAccount, type AccountSnapshot } from '../services/account'
import { colors } from '../theme'

export function AccountView() {
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [status, setStatus] = useState('Локальный режим без аккаунта')
  const [invite, setInvite] = useState('')
  const refresh = async () => { try { if (await getAccountSession()) setSnapshot(await loadAccount()) } catch { setStatus('Аккаунт сервера пока недоступен') } }
  useEffect(() => { void refresh() }, [])
  const register = async () => { try { setSnapshot(await registerDeviceAccount(name.trim() || 'VoiceShield user', phone.trim() || undefined)); setStatus('Аккаунт устройства создан. Телефон пока не подтверждён.') } catch (error) { setStatus(error instanceof Error ? error.message : 'Не удалось создать аккаунт') } }
  const family = async () => { try { const next = await createFamily(familyName.trim() || 'Моя семья'); setSnapshot((current) => current ? { ...current, family: next } : current); setStatus('Семейная группа создана') } catch (error) { setStatus(error instanceof Error ? error.message : 'Не удалось создать группу') } }
  const logout = async () => { await logoutAccount(); setSnapshot(null); setStatus('Вы вышли. Локальные данные не удалены.') }
  const makeInvite = async () => { try { setInvite(await createFamilyInvite()); setStatus('Одноразовый код приглашения создан') } catch (error) { setStatus(error instanceof Error ? error.message : 'Не удалось создать приглашение') } }
  const join = async () => { try { const family = await joinFamily(invite.trim()); setSnapshot((current) => current ? { ...current, family } : current); setStatus('Вы присоединились к семейной группе') } catch (error) { setStatus(error instanceof Error ? error.message : 'Приглашение недействительно') } }
  return <View style={styles.container}>
    <Text style={styles.title}>Аккаунт и семья</Text>
    <Text style={styles.copy}>Аккаунт нужен только для синхронизации. Live Shield и базовая защита работают локально без регистрации.</Text>
    {snapshot ? <View style={styles.card}><Text style={styles.heading}>{snapshot.account.displayName}</Text><Text style={styles.detail}>ID: {snapshot.account.userId}</Text><Text style={styles.detail}>{snapshot.account.phoneVerified ? 'Телефон подтверждён' : 'Телефон не подтверждён'}</Text>{snapshot.family ? <Text style={styles.detail}>Семья: {snapshot.family.name} · {snapshot.family.members.length} участник(ов)</Text> : null}<View style={styles.row}><Pressable style={styles.primary} onPress={() => { void refresh() }}><Text style={styles.primaryText}>Обновить</Text></Pressable><Pressable style={styles.secondary} onPress={() => { void logout() }}><Text style={styles.secondaryText}>Выйти</Text></Pressable></View></View> : <View style={styles.card}><Text style={styles.heading}>Создать аккаунт устройства</Text><TextInput placeholder="Имя" value={name} onChangeText={setName} style={styles.input} placeholderTextColor={colors.muted} /><TextInput placeholder="Телефон позже можно подтвердить" value={phone} onChangeText={setPhone} style={styles.input} keyboardType="phone-pad" placeholderTextColor={colors.muted} /><Pressable style={styles.primary} onPress={() => { void register() }}><Text style={styles.primaryText}>Создать аккаунт</Text></Pressable></View>}
    {snapshot && !snapshot.family ? <View style={styles.card}><Text style={styles.heading}>Семейная защита</Text><TextInput placeholder="Название группы" value={familyName} onChangeText={setFamilyName} style={styles.input} placeholderTextColor={colors.muted} /><Pressable style={styles.primary} onPress={() => { void family() }}><Text style={styles.primaryText}>Создать семейную группу</Text></Pressable><TextInput placeholder="Код приглашения" value={invite} onChangeText={setInvite} style={styles.input} placeholderTextColor={colors.muted} /><Pressable style={styles.secondary} onPress={() => { void join() }}><Text style={styles.secondaryText}>Присоединиться</Text></Pressable></View> : null}
    {snapshot?.family?.role === 'owner' ? <View style={styles.card}><Text style={styles.heading}>Пригласить родственника</Text><Pressable style={styles.primary} onPress={() => { void makeInvite() }}><Text style={styles.primaryText}>Создать код</Text></Pressable>{invite ? <Text style={styles.detail}>{invite}</Text> : null}</View> : null}
    <Text style={styles.status}>{status}</Text>
  </View>
}

const styles = StyleSheet.create({ container: { gap: 12 }, title: { color: colors.ink, fontSize: 25, fontWeight: '900' }, copy: { color: colors.sub, fontSize: 13, lineHeight: 19 }, card: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 9, padding: 15 }, heading: { color: colors.ink, fontSize: 16, fontWeight: '900' }, detail: { color: colors.sub, fontSize: 12 }, input: { backgroundColor: colors.bg, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.ink, padding: 11 }, row: { flexDirection: 'row', gap: 8 }, primary: { backgroundColor: colors.brand, borderRadius: 8, paddingHorizontal: 13, paddingVertical: 11 }, primaryText: { color: '#fff', fontWeight: '900' }, secondary: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 11 }, secondaryText: { color: colors.ink, fontWeight: '800' }, status: { color: colors.sub, fontSize: 12 } })
