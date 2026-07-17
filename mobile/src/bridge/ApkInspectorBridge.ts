import { NativeModules } from 'react-native'

export type ApkInspection = {
  fileName: string
  packageName: string
  versionName: string
  versionCode: number
  sizeBytes: number
  sha256: string
  requestedPermissions: string[]
}

type ApkInspectorNativeModule = {
  pickAndInspect(): Promise<ApkInspection>
}

export const ApkInspectorModule = NativeModules.ApkInspectorModule as ApkInspectorNativeModule | undefined

const sensitivePermissions: Array<[string, string]> = [
  ['android.permission.REQUEST_INSTALL_PACKAGES', 'может предлагать установку других APK'],
  ['android.permission.SYSTEM_ALERT_WINDOW', 'может показывать поверх других приложений'],
  ['android.permission.BIND_ACCESSIBILITY_SERVICE', 'запрашивает службу специальных возможностей'],
  ['android.permission.RECEIVE_SMS', 'может получать SMS'],
  ['android.permission.READ_SMS', 'может читать SMS'],
  ['android.permission.RECORD_AUDIO', 'может записывать звук'],
  ['android.permission.QUERY_ALL_PACKAGES', 'может видеть список приложений'],
  ['android.permission.MANAGE_EXTERNAL_STORAGE', 'запрашивает широкий доступ к файлам'],
]

export type ApkRisk = { score: number; level: 'low' | 'medium' | 'high'; findings: string[] }

export function assessApkRisk(inspection: ApkInspection): ApkRisk {
  const findings = sensitivePermissions
    .filter(([permission]) => inspection.requestedPermissions.includes(permission))
    .map(([, reason]) => reason)
  const score = Math.min(95, findings.length * 18 + (inspection.packageName ? 0 : 30))
  return { score, level: score >= 55 ? 'high' : score >= 18 ? 'medium' : 'low', findings }
}
