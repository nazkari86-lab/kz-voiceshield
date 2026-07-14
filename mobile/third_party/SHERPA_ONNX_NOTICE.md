# sherpa-onnx integration notice

VoiceShield vendors the Java API sources from sherpa-onnx `v1.13.4` under
`app/src/main/java/com/k2fsa/sherpa/onnx` and downloads its matching Android
JNI archive during builds.

- Upstream: https://github.com/k2-fsa/sherpa-onnx
- Version: `v1.13.4`
- Upstream license: Apache License 2.0
- Pinned archive SHA-256:
  `e23223a35d4878b0f61f6d0ae47095ce090fd10d0d8ce41550f91fdbf7d431b1`

The KZ/RU FastConformer model is distributed separately as a VoiceShield GitHub
Release asset. Its model SHA-256 is checked by the application before it is
activated; it is not committed to this repository.
