# KZ VoiceShield

KZ VoiceShield is a browser-based anti-scam call review workspace for Kazakh and Russian conversations.

It helps a reviewer paste or capture a call transcript, score scam risk, inspect matched evidence, review the risk timeline, explore threat rules, simulate real-world scam scenarios, save cases, label outcomes, and export reports or datasets. The current version runs fully in the browser and uses transparent rule-based detection, which makes it suitable for demos, early user testing, and dataset design before adding server-side speech or ML models.

## Core Workflow

1. Paste a transcript, upload a `.txt` file, import `.jsonl` cases, queue an audio file, or use browser live speech recognition.
2. Review the scam risk score, confidence, case ID, and matched signals.
3. Check evidence by category: impersonation, SMS/PIN request, money transfer, urgency, isolation, unofficial channel, remote access, family emergency, or investment scam.
4. Review the timeline, threat lab, simulator, saved case library, dataset panel, and operator playbook.
5. Label the case as unreviewed, true positive, false positive, or needs review.
6. Export a plain-text case report, JSONL training dataset, or CSV audit table.

## Features

- Kazakh/Russian scam phrase detection with weighted threat rules.
- Live browser speech-to-text when supported by the browser.
- Sample scenarios for bank takeover, AI voice family emergency, investment/crypto, delivery/customs, messenger takeover, victim-called setup, and safe calls.
- Explainable scoring with matched terms and category-level advice.
- Case ID, confidence score, immediate response checklist, and downloadable report.
- Multi-view workspace: Case Review, Timeline, Threat Lab, Simulator, Cases, Dataset, Playbook.
- Local case library stored in browser `localStorage`.
- Analyst labels and notes for dataset review.
- JSONL and CSV dataset exports for future ML/NLP training.
- `.jsonl` bulk import for previously reviewed transcripts.
- Audio-file intake placeholder for future backend transcription workflows.
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

## Product Notes

This is an MVP, not a final fraud-detection engine. The next production steps are:

- add real audio upload transcription through a backend service;
- replace localStorage with encrypted server-side case storage when multi-user review is needed;
- add ML/NLP scoring on top of the current explainable rules;
- add reviewer accounts, roles, audit logs, and secure evidence storage;
- add official reporting/export formats for banks or consumer-protection teams.

## Tech Stack

- React 19
- Vite
- TypeScript
- Oxlint
- Lucide icons
