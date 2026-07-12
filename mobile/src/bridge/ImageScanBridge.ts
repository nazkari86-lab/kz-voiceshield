import { NativeModules } from 'react-native'

export type ImageScanResult = { text: string; qrValues: string[] }

type ImageScanNativeModule = {
  pickImageAndScan(): Promise<ImageScanResult>
}

export const ImageScanModule = NativeModules.ImageScanModule as ImageScanNativeModule
