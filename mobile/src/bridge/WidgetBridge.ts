import { NativeModules } from 'react-native'

type WidgetNativeModule = { updateRisk(score: number, level: string): Promise<boolean> }
export const WidgetModule = NativeModules.WidgetModule as WidgetNativeModule | undefined
