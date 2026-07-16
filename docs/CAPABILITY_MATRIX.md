# VoiceShield Capability Matrix

Status as of 2.0.0. "Implemented" means code and deterministic tests exist in this repository; it does not imply public deployment or production validation.

## Implemented locally

- Call screening role and warning before answer through a high-priority Android notification.
- Optional default-phone role with a native incoming/active SIM-call screen and answer, reject, hang-up, mute, and speaker controls.
- Phone Reputation Score with reasons and actions: allow, warn, suggest reject, block.
- Device-local complaints, complaint count/date, trusted list, block list, manual lookup.
- Critical-only automatic blocking, hidden/international/repeated/night-call rules.
- Same-number frequency and rapidly-changing-number burst detection.
- Device-bound HMAC number identifiers; raw numbers are not retained or exported.
- Encrypted per-number labels, relationship types, 0-5 personal ratings, comments, and protected-family status.
- Rule backup/import. Number identifiers in a backup remain valid only on the originating device.
- Conversation scheme classification, phrase evidence, OTP/bank notification context.
- Banking, remote-access, and screen-sharing app context.
- Critical overlay and vibration; official bank callback buttons; family contact mode.
- On-device pasted SMS/messenger/link analysis, including fake-bank domains and APK links.
- On-device screenshot OCR and QR extraction through ML Kit, followed by the same local link/text risk analysis.
- Optional local Gemma/GGUF analysis and consent-gated BYOK cloud text analysis with encrypted API-key storage and pre-transmission redaction.
- Optional automatic transcript deletion when a protection session stops.

## Partial or controlled deployment

- Shared complaints: local reports exist; a cross-user reputation service needs consent, abuse prevention, moderation, and a privacy-reviewed server identifier design.
- Server STT: the authenticated queued API and faster-whisper adapter exist; production compute and RU/KZ WER validation are not deployed.
- Backend case workflow: encrypted SQLite is suitable for one controlled instance; multi-instance production needs managed PostgreSQL, object storage, OIDC, and a durable queue.
- ML: transfer baseline exists but is not used for live decisions until a real reviewer-labelled RU/KZ holdout passes.
- Dangerous APK detection currently identifies suspicious APK download links; it does not execute or malware-scan APK files.

## Requires an external capability

- Carrier-grade spoofing, international route verification, and SIM-swap events require mobile-operator APIs.
- Blocking or delaying a bank transfer, detecting a new recipient, and credit-flow controls require bank integration.
- Shared verified organization caller identity requires signed bank/operator data feeds.
- Malware reputation requires a licensed provider or a maintained internal analysis pipeline.
- Government/regional warning feeds require an authoritative signed feed and freshness monitoring.
- Raw remote-call audio remains unavailable to ordinary default-dialer apps; captions or acoustic microphone capture are still required for transcription.
