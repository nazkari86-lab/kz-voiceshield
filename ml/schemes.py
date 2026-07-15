"""Shared RU/KZ scam-scheme taxonomy.

Mirrors the mobile `ScamScheme` union in mobile/src/scoring.ts so the training
data, the model card, and the app all speak the same taxonomy.
"""
from __future__ import annotations

# scheme id -> human label (English, matches mobile schemeLabels)
SCHEMES: dict[str, str] = {
    "fake_bank_employee": "Fake bank employee",
    "safe_account": "Safe account transfer",
    "fake_police": "Fake police or regulator",
    "investment_scam": "Investment scam",
    "family_emergency": "Family emergency scam",
    "courier_otp": "Courier or delivery OTP scam",
    "remote_access": "Remote access takeover",
    "sim_swap": "SIM-swap takeover",
    "fake_egov": "Fake eGov or benefit claim",
    "marketplace_scam": "Marketplace or job scam",
    "messenger_takeover": "Messenger account takeover",
    "loan_rescue_fraud": "Fake National Bank loan rescue",
    "fake_telecom_support": "Fake telecom support with malware",
    "dropper_recruitment": "Dropper recruitment and bank access sale",
}

LANGS = ("ru", "kz")

# Label mapping for training (matches ml/dataset.py ALLOWED_LABELS):
#   true_positive  = confirmed fraud
#   false_positive = confirmed safe / benign
LABEL_FRAUD = "true_positive"
LABEL_SAFE = "false_positive"
