# KZ VoiceShield

KZ VoiceShield is a browser-based anti-scam call review MVP for Kazakh and Russian conversations.

It helps a reviewer paste or capture a call transcript, score scam risk, inspect matched evidence, and export a case report. The current version runs fully in the browser and uses transparent rule-based detection, which makes it suitable for demos, early user testing, and dataset design before adding server-side speech or ML models.

## Core Workflow

1. Paste a transcript, upload a `.txt` file, or use browser live speech recognition.
2. Review the scam risk score, confidence, case ID, and matched signals.
3. Check evidence by category: impersonation, SMS/PIN request, money transfer, urgency, isolation, unofficial channel, remote access, family emergency, or investment scam.
4. Export a plain-text case report for manual review or escalation.

## Features

- Kazakh/Russian scam phrase detection.
- Live browser speech-to-text when supported by the browser.
- Sample scenarios for bank, family emergency, investment, delivery, and safe calls.
- Explainable scoring with matched terms and category-level advice.
- Case ID, confidence score, immediate response checklist, and downloadable report.
- Local-first MVP with no backend and no transcript upload to a server.

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

## Product Notes

This is an MVP, not a final fraud-detection engine. The next production steps are:

- add real audio upload transcription through a backend service;
- build a labeled KZ/RU scam-call dataset;
- add ML/NLP scoring on top of the current explainable rules;
- add reviewer accounts, case history, and secure evidence storage;
- add official reporting/export formats for banks or consumer-protection teams.

## Tech Stack

- React 19
- Vite
- TypeScript
- Oxlint
- Lucide icons
