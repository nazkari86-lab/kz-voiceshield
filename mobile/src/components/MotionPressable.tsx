import React, { useRef } from 'react'
import { Animated, Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'

type Props = PressableProps & { children: React.ReactNode; style?: StyleProp<ViewStyle> }

export function MotionPressable({ children, disabled, onPress, style, ...props }: Props) {
  const scale = useRef(new Animated.Value(1)).current
  const to = (value: number) => Animated.spring(scale, {
    damping: 18, mass: 0.7, stiffness: 260, toValue: value, useNativeDriver: true,
  }).start()
  return (
    <Pressable
      {...props}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => { if (!disabled) to(0.975) }}
      onPressOut={() => to(1)}
      style={style}
    >
      <Animated.View style={[styles.inner, { opacity: disabled ? 0.55 : 1, transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({ inner: { flex: 1 } })
