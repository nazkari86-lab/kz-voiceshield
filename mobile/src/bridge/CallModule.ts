import { NativeEventEmitter, NativeModules } from 'react-native'

export type SafeCallEvent = {
  direction: 'incoming' | 'unknown'
  verificationStatus: 'passed' | 'failed' | 'unverified' | 'unavailable'
  detectedAt: number
  reputation?: PhoneAssessment
}

export type PhoneAssessment = {
  numberKey: string
  maskedNumber: string
  score: number
  trustRating: number
  category: 'trusted' | 'blocked' | 'reported_spam' | 'suspected_spam' | 'unknown'
  action: 'allow' | 'warn' | 'suggest_reject' | 'block'
  reasons: string[]
  complaintCount: number
  lastComplaintAt: number
}

export type PhoneProtectionConfig = {
  enabled: boolean
  autoBlockCritical: boolean
  blockHidden: boolean
  blockInternational: boolean
  blockRepeated: boolean
  blockUnknownAtNight: boolean
  nightStartHour: number
  nightEndHour: number
}

type CallNativeModule = {
  isAvailable(): Promise<boolean>
  isRoleHeld(): Promise<boolean>
  requestRole(): Promise<boolean>
  consumePendingCall(): Promise<SafeCallEvent | null>
  evaluateNumber(number: string): Promise<PhoneAssessment>
  setNumberDisposition(number: string, disposition: 'trusted' | 'blocked' | 'neutral'): Promise<PhoneAssessment>
  reportNumber(number: string, category: string): Promise<PhoneAssessment>
  getProtectionConfig(): Promise<PhoneProtectionConfig>
  updateProtectionConfig(config: Partial<PhoneProtectionConfig>): Promise<PhoneProtectionConfig>
  exportProtectionData(): Promise<string>
  importProtectionData(payload: string): Promise<boolean>
  clearProtectionData(): Promise<boolean>
}

export const CallModule = NativeModules.CallScreeningModule as CallNativeModule
const _callModule = NativeModules.CallScreeningModule
export const callEvents = _callModule
  ? new NativeEventEmitter(_callModule)
  : ({ addListener: () => ({ remove: () => {} }) } as unknown as NativeEventEmitter)
