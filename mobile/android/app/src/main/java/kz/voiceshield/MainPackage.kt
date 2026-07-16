package kz.voiceshield

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class MainPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    AppRegistry.reactContext = reactContext
    return listOf(
      CallScreeningModule(reactContext),
      AccessibilityModule(reactContext),
      OverlayModule(reactContext),
      WhisperModule(reactContext),
      AudioCaptureModule(reactContext),
      ContactsModule(reactContext),
      ModelDownloader(reactContext),
      SecureStorageModule(reactContext),
      DeviceSettingsModule(reactContext),
      NotificationAccessModule(reactContext),
      ShareIntentModule(reactContext),
      ImageScanModule(reactContext),
      TrainingVoiceModule(reactContext),
      VoiceMessageModule(reactContext),
      LiveAlertModule(reactContext),
      SileroVADModule(reactContext),
      DeepfakeDetectorModule(reactContext),
      SmsScannerModule(reactContext),
      LLMInferenceModule(reactContext),
    )
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
