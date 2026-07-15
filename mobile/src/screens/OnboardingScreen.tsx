import React, { useRef, useState } from 'react'
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'
import { useI18n } from '../I18nContext'

const slides = [
  { id: 'protect', accent: colors.brand },
  { id: 'how', accent: '#0d7ae4' },
  { id: 'speaker', accent: '#c2410c' },
  { id: 'privacy', accent: colors.brandDark },
]

type Props = {
  onDone: () => void
}

export function OnboardingScreen({ onDone }: Props) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)
  const fadeAnim = useRef(new Animated.Value(1)).current

  const goTo = (next: number) => {
    Animated.timing(fadeAnim, { duration: 180, toValue: 0, useNativeDriver: true }).start(() => {
      setIndex(next)
      Animated.timing(fadeAnim, { duration: 220, toValue: 1, useNativeDriver: true }).start()
    })
  }

  const slide = slides[index]!
  const copy = [
    { eyebrow: t.onboarding.welcome, title: t.onboarding.welcomeTitle, body: t.onboarding.welcomeBody },
    { eyebrow: t.onboarding.how, title: t.onboarding.howTitle, body: t.onboarding.howBody },
    { eyebrow: t.onboarding.important, title: t.onboarding.importantTitle, body: t.onboarding.importantBody },
    { eyebrow: t.onboarding.privacy, title: t.onboarding.privacyTitle, body: t.onboarding.privacyBody },
  ][index]!

  return (
    <View style={styles.shell}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
          <Text style={[styles.eyebrow, { color: slide.accent }]}>{copy.eyebrow}</Text>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
        </Animated.View>

        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive, i === index && { backgroundColor: slide.accent }]} />
          ))}
        </View>

        <View style={styles.actions}>
          {index < slides.length - 1 ? (
            <>
              <Pressable style={[styles.primary, { backgroundColor: slide.accent }]} onPress={() => goTo(index + 1)}>
                <Text style={styles.primaryText}>{t.onboarding.next}</Text>
              </Pressable>
              <Pressable style={styles.skip} onPress={onDone}>
                <Text style={styles.skipText}>{t.onboarding.skip}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={[styles.primary, { backgroundColor: slide.accent }]} onPress={onDone}>
              <Text style={styles.primaryText}>{t.onboarding.getStarted}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: { backgroundColor: colors.bg, flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: 28, paddingTop: 60 },
  card: { gap: 14, marginBottom: 40 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: colors.ink, fontSize: 34, fontWeight: '900', lineHeight: 40 },
  body: { color: colors.sub, fontSize: 15, lineHeight: 23 },
  dots: { flexDirection: 'row', gap: 7, justifyContent: 'center', marginBottom: 36 },
  dot: { backgroundColor: colors.border, borderRadius: 5, height: 8, width: 8 },
  dotActive: { width: 22 },
  actions: { gap: 12 },
  primary: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 16 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  skip: { alignItems: 'center', paddingVertical: 10 },
  skipText: { color: colors.muted, fontSize: 14, fontWeight: '800' },
})
