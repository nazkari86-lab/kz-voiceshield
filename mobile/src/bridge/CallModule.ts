import { NativeEventEmitter, NativeModules } from 'react-native'

export type SafeCallEvent = {
  direction: 'incoming' | 'unknown'
  verificationStatus: 'passed' | 'failed' | 'unverified' | 'unavailable'
  detectedAt: number
  reputation?: PhoneAssessment
}

export type PostCallEvent = { maskedNumber?: string; reason: string; durationSeconds: number; wangiri: boolean; blocked: boolean }

export type PhoneAssessment = {
  numberKey: string
  maskedNumber: string
  score: number
  trustRating: number
  category: 'family' | 'trusted' | 'blocked' | 'reported_spam' | 'suspected_spam' | 'unknown'
  action: 'allow' | 'warn' | 'suggest_reject' | 'block'
  reasons: string[]
  complaintCount: number
  lastComplaintAt: number
  annotation: PhoneAnnotation
}

export type PhoneRelationship = 'unknown' | 'family' | 'friend' | 'work' | 'bank' | 'delivery' | 'medical' | 'government'

export type PhoneAnnotation = {
  rating: number
  comment: string
  label: string
  relationship: PhoneRelationship
  familyProtected: boolean
  updatedAt: number
}

export type PhoneProtectionConfig = {
  enabled: boolean
  autoBlockCritical: boolean
  blockHidden: boolean
  blockInternational: boolean
  blockUnknownNotContacts: boolean
  blockRepeated: boolean
  blockUnknownAtNight: boolean
  repeatedMinIntervalSeconds: number
  nightStartHour: number
  nightEndHour: number
}

export type PhoneCustomRule = {
  id: string
  label: string
  pattern: string
  action: 'warn' | 'suggest_reject' | 'block'
  enabled: boolean
  updatedAt: number
}

type CallNativeModule = {
  isAvailable(): Promise<boolean>
  isRoleHeld(): Promise<boolean>
  requestRole(): Promise<boolean>
  isDialerRoleHeld(): Promise<boolean>
  requestDialerRole(): Promise<boolean>
  consumePendingCall(): Promise<SafeCallEvent | null>
  evaluateNumber(number: string): Promise<PhoneAssessment>
  setNumberDisposition(number: string, disposition: 'trusted' | 'blocked' | 'neutral'): Promise<PhoneAssessment>
  reportNumber(number: string, category: string): Promise<PhoneAssessment>
  annotateNumber(number: string, rating: number, comment: string, relationship: PhoneRelationship, label: string, familyProtected: boolean): Promise<PhoneAssessment>
  clearNumberAnnotation(number: string): Promise<PhoneAssessment>
  listCustomRules(): Promise<PhoneCustomRule[]>
  upsertCustomRule(label: string, pattern: string, action: PhoneCustomRule['action'], enabled: boolean): Promise<PhoneCustomRule>
  deleteCustomRule(id: string): Promise<boolean>
  getProtectionConfig(): Promise<PhoneProtectionConfig>
  updateProtectionConfig(config: Partial<PhoneProtectionConfig>): Promise<PhoneProtectionConfig>
  exportProtectionData(): Promise<string>
  importProtectionData(payload: string): Promise<boolean>
  clearProtectionData(): Promise<boolean>
  endActiveCall(): Promise<boolean>
  openActiveCallControls(): Promise<boolean>
}

export const CallModule = NativeModules.CallScreeningModule as CallNativeModule
const _callModule = NativeModules.CallScreeningModule
export const callEvents = _callModule
  ? new NativeEventEmitter(_callModule)
  : ({ addListener: () => ({ remove: () => {} }) } as unknown as NativeEventEmitter)
