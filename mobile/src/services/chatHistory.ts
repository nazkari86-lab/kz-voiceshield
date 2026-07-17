import { SecureStorage } from '../bridge/SecureStorageBridge'
import { normalizeChatSessions, serializeChatSessions, type ChatSession } from '../utils/chatWorkspace'

export const CHAT_HISTORY_STORAGE_KEY = 'voiceshield.ai-chat-history.v1'

export async function loadChatHistory(): Promise<ChatSession[]> {
  return normalizeChatSessions(await SecureStorage.getItem(CHAT_HISTORY_STORAGE_KEY))
}

export async function saveChatHistory(sessions: ChatSession[]): Promise<void> {
  await SecureStorage.setItem(CHAT_HISTORY_STORAGE_KEY, serializeChatSessions(sessions))
}
