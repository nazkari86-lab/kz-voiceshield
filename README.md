# KZ VoiceShield

[![CI](https://github.com/nazkari86-lab/kz-voiceshield/actions/workflows/ci.yml/badge.svg)](https://github.com/nazkari86-lab/kz-voiceshield/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

KZ VoiceShield is a browser-based anti-scam call review workspace for Kazakh and Russian conversations.

It helps a reviewer paste or capture a call transcript, score scam risk, inspect matched evidence, review the risk timeline, explore threat rules, simulate real-world scam scenarios, save cases, label outcomes, and export reports or datasets. The current version runs fully in the browser and uses transparent rule-based detection, which makes it suitable for demos, early user testing, and dataset design before adding server-side speech or ML models.

## Core Workflow

1. Paste a transcript, upload a `.txt` file, import `.jsonl` cases, upload audio to a configured backend, or use browser live speech recognition.
2. Review the scam risk score, confidence, case ID, and matched signals.
3. Check evidence by category: impersonation, SMS/PIN request, money transfer, urgency, isolation, unofficial channel, remote access, family emergency, or investment scam.
4. Review the timeline, threat lab, simulator, saved case library, dataset panel, and operator playbook.
5. Label the case as unreviewed, true positive, false positive, or needs review.
6. Move the case through `new -> reviewing -> escalated -> closed`, assign a reviewer, set bank-contact/evidence flags, and export a report or evidence bundle.
7. Monitor the Operations queue for escalations, bank-contact backlog, stale open cases, and unsynced local cases.
8. Export a plain-text case report, JSONL training dataset, CSV audit table, or train/dev/test split.

## Features

- Kazakh/Russian scam phrase detection with weighted threat rules.
- Live browser speech-to-text when supported by the browser.
- Sample scenarios for bank takeover, AI voice family emergency, investment/crypto, delivery/customs, messenger takeover, victim-called setup, and safe calls.
- Explainable scoring with matched terms and category-level advice.
- Case ID, confidence score, immediate response checklist, and downloadable report.
- Multi-view workspace: Case Review, Timeline, Threat Lab, Simulator, Cases, Dataset, Playbook.
- Local case library stored in browser `localStorage`.
- Analyst labels and notes for dataset review.
- Reviewer workflow with statuses, assignees, audit log, decision history, incident timeline, and escalation flags.
- Evidence bundle export for handoff to bank fraud teams, internal supervisors, or incident responders.
- Operations dashboard for escalation queue, bank-contact queue, status counts, stale cases, and backend sync state.
- JSONL and CSV dataset exports for future ML/NLP training.
- Dataset quality checks for label balance, duplicates, false-positive review, average length, and schema version.
- Deterministic train/dev/test split export for baseline classifier experiments.
- Optional backend adapter for server transcription and ML comparison without replacing local rule scoring.
- `.jsonl` bulk import for previously reviewed transcripts.
- Audio-file intake placeholder in local-only mode and `/transcribe-audio` upload when `VITE_VOICESHIELD_API_URL` is configured.
- Safe-context handling so ordinary text and defensive warnings stay at zero risk.
- Local-first MVP with no backend and no transcript upload to a server.

## Threat Coverage

- Bank/security-service impersonation.
- Police, regulator, prosecutor, or government pressure.
- SMS/OTP/PIN/CVV/IIN extraction.
- Safe-account, loan, cash-out, and urgent transfer scripts.
- Remote access and screen-sharing requests.
- WhatsApp/Telegram account takeover.
- AI voice or family emergency scams.
- Delivery/customs smishing and payment links.
- Investment, crypto, guaranteed-profit, romance, job, and marketplace scams.
- Reverse-vishing setup calls where the victim calls a fake number from a notice.

## Run Locally

```bash
npm install
npm run dev
```

Open the Vite URL printed in the terminal.

## Build

```bash
npm run build
```

## Lint

```bash
npm run lint
```

## Test

```bash
npm test
```

28 tests across 11 describe groups: safe input, bank fraud, AI voice/family, reverse-vishing, SIM swap, eGov/benefits, Kaspi QR, job scam, investment/delivery, messenger takeover, law enforcement, short-text penalty, and dataset export/quality/split.

## Deploy

The repository includes production-ready SPA fallbacks for both Vercel and Netlify:

- `vercel.json` rewrites routes to `index.html`.
- `netlify.toml` builds with `npm run build` and publishes `dist`.
- `.env.example` reserves `VITE_VOICESHIELD_API_URL` for a future backend.

## Optional Backend Contract

When `VITE_VOICESHIELD_API_URL` is set, the frontend keeps rule scoring local but can call:

- `POST /analyze-transcript` with `{ transcript, ruleAnalysis }`, returning `{ ml }` or the ML object directly.
- `POST /transcribe-audio` with multipart field `audio`, returning `{ transcript, transcriptConfidence, ml? }`.
- `PUT /cases/:id` with the serialized case schema, returning `{ ok, remoteId?, syncedAt? }`.

The ML object is normalized as `{ verdict: "fraud" | "safe" | "needs_review", score, confidence, model, embeddingModel?, signals[] }`. The UI shows disagreements such as "rules high, ML low" instead of replacing the rule score.

## CI

GitHub Actions runs `npm ci`, `npm run lint`, `npm test`, and `npm run build` on pushes to `main` and pull requests.

## Product Notes

This is an MVP, not a final fraud-detection engine. The next production steps are:

- add real audio upload transcription through a backend service;
- replace localStorage with encrypted server-side case storage when multi-user review is needed;
- add ML/NLP scoring on top of the current explainable rules;
- add real reviewer accounts, roles, SSO, and secure evidence storage;
- add official reporting/export formats for banks or consumer-protection teams.

## Tech Stack

- React 19
- Vite
- TypeScript
- Oxlint
- Lucide icons
