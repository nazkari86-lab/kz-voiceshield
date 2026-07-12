import React, { useEffect, useRef } from 'react'
import { Animated, StyleSheet } from 'react-native'

export function ScreenMotion({ children, screenKey }: { children: React.ReactNode; screenKey: string }) {
  const opacity = useRef(new Animated.Value(0)).current
  const translate = useRef(new Animated.Value(10)).current

  useEffect(() => {
    opacity.setValue(0)
    translate.setValue(10)
    Animated.parallel([
      Animated.timing(opacity, { duration: 220, toValue: 1, useNativeDriver: true }),
      Animated.timing(translate, { duration: 220, toValue: 0, useNativeDriver: true }),
    ]).start()
  }, [opacity, screenKey, translate])

  return <Animated.View style={[styles.view, { opacity, transform: [{ translateY: translate }] }]}>{children}</Animated.View>
}

const styles = StyleSheet.create({ view: { flex: 1 } })
