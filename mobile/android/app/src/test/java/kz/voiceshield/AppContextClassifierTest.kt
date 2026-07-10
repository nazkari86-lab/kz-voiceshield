package kz.voiceshield

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppContextClassifierTest {
  @Test fun classifiesOnlyRiskCategories() {
    assertEquals("bank_app_open", AppContextClassifier.classify("kz.kaspi.mobile"))
    assertEquals("remote_access_app_open", AppContextClassifier.classify("com.anydesk.anydeskandroid"))
    assertEquals("screen_share_app_open", AppContextClassifier.classify("us.zoom.videomeetings"))
    assertNull(AppContextClassifier.classify("com.example.notes"))
  }
}
