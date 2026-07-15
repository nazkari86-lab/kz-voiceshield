package kz.voiceshield

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneReputationPolicyTest {
  @Test fun trustedVerifiedNumberIsAllowed() {
    val result = PhoneReputationPolicy.evaluate(PhoneRiskInput(verificationStatus = "passed", trusted = true, autoBlockCritical = true))
    assertEquals(0, result.score)
    assertEquals("trusted", result.category)
    assertEquals("allow", result.action)
  }

  @Test fun verificationFailureOverridesTrustedDisposition() {
    val result = PhoneReputationPolicy.evaluate(PhoneRiskInput(verificationStatus = "failed", trusted = true))
    assertTrue(result.score >= 65)
    assertEquals("suggest_reject", result.action)
  }

  @Test fun blockListBecomesCriticalAndCanAutoBlock() {
    val result = PhoneReputationPolicy.evaluate(PhoneRiskInput(verificationStatus = "unverified", blocked = true, autoBlockCritical = true))
    assertEquals(100, result.score)
    assertEquals("block", result.action)
  }

  @Test fun complaintsAndRepeatedCallsAccumulateRisk() {
    val result = PhoneReputationPolicy.evaluate(
      PhoneRiskInput(verificationStatus = "unverified", complaintCount = 2, recentCallCount = 5),
    )
    assertTrue(result.score >= 65)
    assertEquals("reported_spam", result.category)
  }

  @Test fun unknownNightCallerOnlyBlocksWhenBothRulesAreEnabled() {
    val result = PhoneReputationPolicy.evaluate(
      PhoneRiskInput(
        verificationStatus = "unverified",
        quietHours = true,
        blockUnknownAtNight = true,
        autoBlockCritical = true,
      ),
    )
    assertEquals(85, result.score)
    assertEquals("block", result.action)
  }

  @Test fun rapidlyChangingNumbersRaiseMassDialRisk() {
    val result = PhoneReputationPolicy.evaluate(
      PhoneRiskInput(verificationStatus = "unverified", distinctRecentCallers = 9),
    )
    assertTrue(result.score >= 35)
    assertEquals("warn", result.action)
  }

  @Test fun familyProtectionBypassesNightRuleButNotVerificationFailure() {
    val allowed = PhoneReputationPolicy.evaluate(
      PhoneRiskInput(verificationStatus = "passed", familyProtected = true, quietHours = true, blockUnknownAtNight = true),
    )
    assertEquals(0, allowed.score)
    assertEquals("family", allowed.category)
    assertEquals("allow", allowed.action)

    val failed = PhoneReputationPolicy.evaluate(
      PhoneRiskInput(verificationStatus = "failed", familyProtected = true),
    )
    assertTrue(failed.score >= 65)
    assertEquals("suggest_reject", failed.action)
  }

  @Test fun personalRatingsInfluenceUnknownNumberWithoutOverridingHardBlock() {
    val low = PhoneReputationPolicy.evaluate(PhoneRiskInput(verificationStatus = "unverified", userRating = 1))
    val high = PhoneReputationPolicy.evaluate(PhoneRiskInput(verificationStatus = "unverified", userRating = 5))
    assertTrue(low.score > high.score)

    val blocked = PhoneReputationPolicy.evaluate(
      PhoneRiskInput(verificationStatus = "passed", blocked = true, userRating = 5),
    )
    assertTrue(blocked.score >= 85)
    assertEquals("blocked", blocked.category)
  }

  @Test fun familyLabelDoesNotOverrideComplaintsOrLowPersonalRating() {
    val complained = PhoneReputationPolicy.evaluate(
      PhoneRiskInput(verificationStatus = "unverified", familyProtected = true, complaintCount = 4),
    )
    assertEquals("reported_spam", complained.category)
    assertTrue(complained.score >= 65)

    val lowRated = PhoneReputationPolicy.evaluate(
      PhoneRiskInput(verificationStatus = "unverified", familyProtected = true, userRating = 1),
    )
    assertTrue(lowRated.score >= 35)
    assertEquals("warn", lowRated.action)
  }
}
