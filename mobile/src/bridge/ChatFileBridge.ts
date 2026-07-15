import { NativeModules } from 'react-native'

export type ChatAttachment = {
  name: string
  mimeType: string
  size: number
  text?: string
  base64?: string
  note?: string
}

type ChatFileNativeModule = {
  pickFile(): Promise<ChatAttachment | null>
}

export const ChatFileModule = NativeModules.ChatFileModule as ChatFileNativeModule
