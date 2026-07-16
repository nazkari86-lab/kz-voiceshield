# KZ VoiceShield 2.0.3

Patch release based on the user-verified `v2.0.2` Xiaomi baseline.

## Fixed

- Family Protection now keeps device contacts in a searchable, bounded scroll
  list instead of allowing rows to overlap the save action.
- Cloud AI requests use a larger bounded completion budget and continue an
  answer when a provider explicitly reports an output-length stop.
- SMS Scanner no longer escalates an ordinary bank OTP by keyword alone;
  high risk requires a risky request and supporting fraud signals.
- The in-app knowledge graph includes the current feature catalog and truthful
  release records for the assistant.
- Idle Live Shield no longer shows an active-call pause card from a saved demo
  transcript, and the shared animated button layout no longer expands to the
  remaining scroll height.

## Verification

- Mobile TypeScript typecheck and 70 Jest tests pass.
- The APK must be installed and checked on the physical Xiaomi before treating
  this patch as a replacement for the `v2.0.2` rollback baseline.
