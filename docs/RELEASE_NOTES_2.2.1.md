# KZ VoiceShield 2.2.1

## Training voice and learning quality

- Added Microsoft Edge Neural TTS through `edge-tts`; no API key is required.
- Added RU/KZ Microsoft voices to the authenticated training voice catalog.
- Kept ElevenLabs account voices available when the backend key is configured.
- Added cached synthetic training audio with provider-safe voice hashes.
- Added branching RU/KZ scenarios for Kaspi, Halyk, eGov, OLX and related schemes.
- Added four difficulty levels, spoken answer capture, local safe/unsafe assessment,
  adaptive skill tracking, reaction time and training evidence packages.
- Added the guided training path with a Kazakhstan snow leopard mascot.

## Safety boundary

- No changes were made to the protected Live Shield capture/Whisper lifecycle.
- Training audio is synthetic and is never treated as a real call transcript.
- Edge TTS requires internet access; Android system TTS remains the fallback.

## Verification

- Mobile TypeScript and Jest pass.
- Backend tests pass.
- ML quality-lab unittest suite passes.
- Microsoft Edge TTS smoke test generated audio successfully.
