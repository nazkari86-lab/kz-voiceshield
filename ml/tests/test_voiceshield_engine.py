import unittest

from ml.voiceshield_engine import VoiceShieldEngine
from ml.subword_tokenizer import KzRuSubwordTokenizer


class VoiceShieldEngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = VoiceShieldEngine()

    def assertClass(self, text, expected):
        result = self.engine.analyze(text)
        self.assertEqual(result.fraud_class, expected, result.to_dict())

    def test_safe_transaction(self):
        result = self.engine.analyze("Kaspi: Списание 5000 тг на АЗС. Баланс 45000 тг")
        self.assertEqual(result.fraud_class, "SAFE")
        self.assertEqual(result.risk_level, "none")
        self.assertTrue(result.safe_context)

    def test_safe_otp_is_not_fraud(self):
        result = self.engine.analyze("Ваш код подтверждения Kaspi для входа: 4521. Никому не сообщайте")
        self.assertEqual(result.fraud_class, "SAFE")
        self.assertEqual(result.risk_level, "none")

    def test_bank_safe_account(self):
        self.assertClass("Служба безопасности банка: срочно переведите деньги на безопасный счет", "GRM_BANK_FRAUD_KZ")

    def test_police_scam(self):
        self.assertClass("Я следователь, родственник задержан, срочно нужен залог", "GRM_POLICE_SCAM_KZ")

    def test_egov_phishing(self):
        self.assertClass("Перейдите по ссылке egov и введите код", "GRM_EGOV_SCAM_KZ")

    def test_investment_scam(self):
        self.assertClass("Гарантированный доход от инвестиций, вложите деньги", "GRM_INVEST_SCAM_KZ")

    def test_smishing(self):
        self.assertClass("Скачайте приложение и перейдите по ссылке для входа", "GRM_SMISHING_KZ")

    def test_kazakh_bank_rule(self):
        self.assertClass("Банк қызметкері: шұғыл ақша аударыңыз қауіпсіз шотқа", "GRM_BANK_FRAUD_KZ")

    def test_known_brand_does_not_override_risk(self):
        result = self.engine.analyze("Kaspi: срочно переведите деньги на безопасный счет")
        self.assertEqual(result.fraud_class, "GRM_BANK_FRAUD_KZ")
        self.assertFalse(result.safe_context)

    def test_empty_text_is_neutral(self):
        result = self.engine.analyze("   ")
        self.assertEqual(result.fraud_class, "UNKNOWN")
        self.assertEqual(result.confidence, 0.0)

    def test_extended_lottery_and_recovery_rules(self):
        self.assertClass("Вы выиграли приз, оплатите комиссию для получения", "GRM_LOTTERY_SCAM_KZ")
        self.assertClass("Вам одобрена компенсация, оплатите комиссию за возврат", "GRM_RECOVERY_SCAM_KZ")

    def test_decision_tier_is_recommendation_not_automatic_action(self):
        result = self.engine.analyze("Служба безопасности банка: срочно переведите деньги на безопасный счет")
        self.assertEqual(result.decision, 5)
        self.assertTrue(result.user_action_recommended)

    def test_safe_signal_does_not_stop_session_screening(self):
        state = self.engine.start_session("test-session")
        first = self.engine.analyze_chunk(state, "Kaspi: списание 5000 тг, баланс 40000 тг", confidence=0.99)
        self.assertIn(first.decision, (1, 2))
        self.assertFalse(state.finalized)
        second = self.engine.analyze_chunk(state, "Срочно переведите деньги на безопасный счет", confidence=0.99, force_final=True)
        self.assertEqual(second.decision, 5)
        self.assertTrue(state.finalized)

    def test_timeout_finalizes_unknown_without_promoting_it_to_spam(self):
        state = self.engine.start_session("timeout-session")
        result = self.engine.analyze_chunk(state, "Здравствуйте, это служба поддержки", confidence=0.9, elapsed_s=15)
        self.assertTrue(result.force_final)
        self.assertEqual(result.decision, 3)
        self.assertFalse(result.user_action_recommended)

    def test_engine_keeps_dependency_free_fallback_without_model(self):
        engine = VoiceShieldEngine(tokenizer_model=None)
        self.assertIsNone(engine.subword_tokenizer)
        self.assertEqual(KzRuSubwordTokenizer().encode("Kaspi төлем"), ["▁kaspi", "kas", "▁төлем", "төл"])


if __name__ == "__main__":
    unittest.main()
