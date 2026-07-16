import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { colors } from '../theme'

type Props = {
  audioLevel: number
  isActive: boolean
  barCount?: number
  height?: number
  color?: string
}

const HISTORY_LEN = 30

export function WaveformView({ audioLevel, isActive, barCount = 30, height = 40, color }: Props) {
  const historyRef = useRef<number[]>(Array(HISTORY_LEN).fill(0))
  const animValues = useRef<Animated.Value[]>(
    Array.from({ length: HISTORY_LEN }, () => new Animated.Value(0))
  ).current

  useEffect(() => {
    if (!isActive) {
      // Decay all bars to 0
      historyRef.current = Array(HISTORY_LEN).fill(0)
      animValues.forEach(v => Animated.timing(v, { toValue: 0, duration: 250, useNativeDriver: true }).start())
      return
    }
    // Shift history left, push new level
    const hist = historyRef.current
    hist.push(audioLevel)
    if (hist.length > HISTORY_LEN) hist.shift()
    // Scale transforms stay on the native animation thread. Animating height
    // forced React Native to schedule hundreds of JS layout animations/second.
    hist.forEach((level, i) => {
      const bar = animValues[i]
      if (!bar) return
      Animated.timing(bar, {
        toValue: Math.min(1, level * 6),
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start()
    })
  }, [audioLevel, isActive, animValues])

  const barWidth = Math.max(1, Math.floor((barCount * 2 - (barCount - 1)) / barCount))
  const activeColor = color ?? colors.brand
  return (
    <View style={[styles.container, { height }]}>
      {animValues.map((anim, idx) => {
        // Color gradient: older bars (left) are lighter, newest bar is brightest
        const age = (HISTORY_LEN - 1 - idx) / (HISTORY_LEN - 1)
        const opacity = 0.25 + (1 - age) * 0.75
        const isCurrent = idx === HISTORY_LEN - 1
        return (
          <Animated.View
            key={idx}
            style={[
              styles.bar,
              {
                width: barWidth,
                backgroundColor: isCurrent ? activeColor : activeColor,
                opacity,
                height,
                transform: [{ scaleY: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.05, 1],
                }) }],
              },
            ]}
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bar: {
    borderRadius: 2,
    minHeight: 2,
  },
})
