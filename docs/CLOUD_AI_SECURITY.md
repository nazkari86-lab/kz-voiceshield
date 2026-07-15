# Cloud AI security and provider support

VoiceShield 1.8.0 supports user-supplied API credentials for OpenAI, Anthropic,
Google Gemini, Groq, Cerebras, OpenRouter, xAI, DeepSeek, and Mistral.

## Implemented runtime

- Fetches the model list from the selected provider instead of maintaining a
  stale hard-coded model list.
- Filters OpenRouter models by free or paid pricing metadata.
- Uses the selected cloud model in both AI assistant chat and Live AI call
  analysis.
- Keeps local Gemma and GGUF inference available as separate engines.
- Cancels in-flight cloud analysis when the user stops generation or switches
  engines.
- Uses only fixed HTTPS provider hosts defined in the application. A model or
  API response cannot replace the API base URL.

## Credential controls

- API keys are encrypted with AES-GCM. The encryption key is generated and
  retained by Android Keystore and is not exportable through the application.
- Only provider and model IDs are stored in AsyncStorage. API keys are never
  stored there, bundled into the APK, included in logs, or displayed after
  saving.
- A key is validated by listing the account's models before it is saved.
- Provider error messages are scrubbed of the current API key.
- Android backup and cleartext HTTP traffic are disabled.
- The credential screen sets Android `FLAG_SECURE`, blocking screenshots and
  recent-app previews while a key can be entered.

These controls reduce exposure on a normal non-rooted Android device. They
cannot make a secret impossible to recover from a rooted, instrumented, or
otherwise compromised device because the credential must briefly exist in
process memory to authorize an HTTPS request. Users should create restricted
keys, set provider-side spending limits, and revoke lost credentials.

## Capability boundary

Text chat and transcript analysis are implemented across all listed providers.
Capability badges for tools, vision, image generation, and voice describe the
provider API, but those features are not treated as interchangeable: request
schemas, model eligibility, billing, and safety behavior differ by provider.

Realtime voice must not expose a long-lived master key to a WebRTC session.
The production path is a VoiceShield backend endpoint that mints a short-lived
provider token, followed by a native WebRTC client. Until that proxy is
configured, the catalog marks realtime voice as requiring a proxy rather than
falling back to an unsafe implementation.
