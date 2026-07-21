import { NativeEventEmitter, NativeModules } from 'react-native'

export type ChatAttachment = {
  fileName: string
  mimeType: string
  text: string
  truncated: boolean
  kind: 'text' | 'image' | 'document' | 'archive'
  uri?: string
}

type ChatAttachmentNativeModule = {
  pickReadableAttachment(): Promise<ChatAttachment>
  consumePendingSharedAttachment(): Promise<ChatAttachment | null>
  readAttachmentImageBase64(uri: string): Promise<{ mimeType: string; base64: string }>
}

export const ChatAttachmentModule = NativeModules.ChatAttachmentModule as ChatAttachmentNativeModule | undefined

const nativeModule = NativeModules.ChatAttachmentModule
export const chatAttachmentEvents = nativeModule
  ? new NativeEventEmitter(nativeModule)
  : ({ addListener: () => ({ remove: () => {} }) } as unknown as NativeEventEmitter)
