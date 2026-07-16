import { NativeModules } from 'react-native'

export type DeviceContact = { id: string; name: string; phone: string }

type ContactsNativeModule = {
  getContacts(limit: number): Promise<DeviceContact[]>
}

export const ContactsModule = NativeModules.ContactsModule as ContactsNativeModule
