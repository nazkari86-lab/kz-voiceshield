#include <jni.h>

namespace {
jboolean flagFalse() {
  return JNI_FALSE;
}

jboolean flagTrue() {
  return JNI_TRUE;
}
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_commonTestFlag(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_disableMountItemReorderingAndroid(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableAccumulatedUpdatesInRawPropsAndroid(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableBridgelessArchitecture(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableCppPropsIteratorSetter(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableEagerRootViewAttachment(JNIEnv *, jclass) {
  return flagTrue();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableFabricLogs(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableFabricRenderer(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableIOSViewClipToPaddingBox(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableImagePrefetchingAndroid(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableJSRuntimeGCOnMemoryPressureOnIOS(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableLayoutAnimationsOnAndroid(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableLayoutAnimationsOnIOS(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableLongTaskAPI(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableNativeCSSParsing(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableNewBackgroundAndBorderDrawables(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enablePreciseSchedulingForPremountItemsOnAndroid(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enablePropsUpdateReconciliationAndroid(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableReportEventPaintTime(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableSynchronousStateUpdates(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableUIConsistency(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableViewCulling(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableViewRecycling(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableViewRecyclingForText(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_enableViewRecyclingForView(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_excludeYogaFromRawProps(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_fixDifferentiatorEmittingUpdatesWithWrongParentTag(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_fixMappingOfEventPrioritiesBetweenFabricAndReact(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_fixMountingCoordinatorReportedPendingTransactionsOnAndroid(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_fuseboxEnabledRelease(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_fuseboxNetworkInspectionEnabled(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_lazyAnimationCallbacks(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_removeTurboModuleManagerDelegateMutex(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_throwExceptionInsteadOfDeadlockOnTurboModuleSetupDuringSyncRenderIOS(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_traceTurboModulePromiseRejectionsOnAndroid(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_updateRuntimeShadowNodeReferencesOnCommit(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_useAlwaysAvailableJSErrorHandling(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_useEditTextStockAndroidFocusBehavior(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_useFabricInterop(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_useNativeViewConfigsInBridgelessMode(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_useOptimizedEventBatchingOnAndroid(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_useRawPropsJsiValue(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_useShadowNodeStateOnClone(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_useTurboModuleInterop(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_useTurboModules(JNIEnv *, jclass) {
  return flagFalse();
}

extern "C" JNIEXPORT void JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_override(JNIEnv *, jclass, jobject) {
}

extern "C" JNIEXPORT void JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_dangerouslyReset(JNIEnv *, jclass) {
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_facebook_react_internal_featureflags_ReactNativeFeatureFlagsCxxInterop_dangerouslyForceOverride(JNIEnv *env, jclass, jobject) {
  return nullptr;
}
