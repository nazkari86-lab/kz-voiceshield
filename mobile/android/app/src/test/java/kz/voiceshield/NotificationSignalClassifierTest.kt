package kz.voiceshield

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NotificationSignalClassifierTest {
  @Test fun classifiesOtpWithoutReturningItsValue() {
    assertEquals("otp_notification", NotificationSignalClassifier.classify("Ваш одноразовый код 123456"))
  }

  @Test fun classifiesBankActivity() {
    assertEquals("bank_activity_notification", NotificationSignalClassifier.classify("Выполнен перевод на карту"))
  }

  @Test fun ignoresOrdinaryNotifications() {
    assertNull(NotificationSignalClassifier.classify("Ваша запись в клинику завтра"))
  }
}
