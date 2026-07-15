# KZ VoiceShield Privacy Policy

Effective date: 2026-07-15

KZ VoiceShield is a local-first fraud-protection prototype. This policy describes the data handled by the Android and web applications in this repository. Questions and deletion requests can be submitted through the repository issue tracker.

## Data Processed

- Call captions and microphone audio are processed only while the user has explicitly started a protection session.
- Active application package names may be classified locally as banking, remote-access, or screen-sharing context during that session.
- With optional notification access, notification text is classified locally into a limited risk type such as OTP or bank activity. Notification text and secret values are not sent to JavaScript or retained.
- With explicit consent and the Android call-screening role, number reputation uses a device-bound HMAC identifier, a masked last-four display, local complaint counts, and short-lived call-frequency timestamps. Raw phone numbers are not retained or exported.
- A trusted contact name and phone number are stored only when entered by the user.
- Optional user-selected cloud AI providers process redacted message or transcript text only after provider-specific consent. Call audio, contacts, notification text, saved cases, and API keys are not included in these requests.

## Storage and Retention

Android cases, consent state, and trusted-contact data are encrypted with a non-exportable Android Keystore key. Phone identifiers are keyed with a non-exportable Android Keystore HMAC key. Transcripts are redacted before persistence or export. Data remains on the device until the user deletes individual cases, clears number rules, uses "Delete all local data", clears app data, or uninstalls the application.

The downloaded Whisper model is stored in the private app directory and is removed by "Delete all local data". Live audio buffers are cleared after transcription and are not saved as audio files.

The web workspace uses browser local storage and therefore saves only redacted case text. Browser data can be deleted from the Dataset view or through browser site-data controls.

## Network Use

Local-only mode does not upload audio, transcripts, cases, contacts, notification text, or phone numbers. Network access is used to download verified speech and local language models from configured trusted sources. The optional web backend adapter sends data only when `VITE_VOICESHIELD_API_URL` is explicitly configured by the operator.

When a user connects OpenAI, Anthropic, Google Gemini, Groq, Cerebras, OpenRouter, xAI, DeepSeek, or Mistral with their own API key, the selected provider receives the redacted text required for the requested response. Provider-specific consent is required before chat requests. Automatic Live AI analysis requires an additional explicit consent for that provider and remains blocked without it. Provider billing, logging, and retention are governed by the user's agreement with that provider. VoiceShield does not proxy these requests in the current private-beta build.

## User Control

Protection permissions are requested only after an in-app disclosure. Revoking in-app consent disables native number reputation even if the Android call-screening role remains assigned. Cloud provider consent and automatic Live AI consent are separate and can be revoked independently. Removing a provider key also removes both consents for that provider. The user can decline, revoke Android permissions, stop an active session, remove the trusted contact, delete individual cases, or delete all local data. Manual transcript and link analysis remains available without granting call, notification, overlay, or accessibility access.

## Security

The Android application verifies the expected model size and SHA-256 before loading it. Saved sensitive data is encrypted at rest and secret-like numeric values are redacted before persistence and export. No system can guarantee that every fraud attempt will be detected; users should independently contact banks through official channels.

## Children

KZ VoiceShield is not directed to children and should not be used to monitor another person without their knowledge and lawful consent.

## Changes

Material changes to data collection, sharing, retention, or backend operation require an updated policy and renewed in-app disclosure where applicable.
