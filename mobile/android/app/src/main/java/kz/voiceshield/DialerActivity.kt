package kz.voiceshield

import android.app.Activity
import android.net.Uri
import android.os.Bundle
import android.telecom.TelecomManager
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

class DialerActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val density = resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()
    val number = EditText(this).apply {
      hint = "+7 700 000 00 00"
      inputType = android.text.InputType.TYPE_CLASS_PHONE
      setText(intent?.data?.schemeSpecificPart.orEmpty())
      textSize = 22f
    }
    val call = Button(this).apply {
      text = "Call with VoiceShield"
      setOnClickListener {
        val uri = Uri.fromParts("tel", number.text.toString().trim(), null)
        runCatching { getSystemService(TelecomManager::class.java).placeCall(uri, Bundle()) }
      }
    }
    setContentView(LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(dp(24), dp(48), dp(24), dp(24))
      addView(TextView(this@DialerActivity).apply { text = "VoiceShield phone"; textSize = 28f }, LinearLayout.LayoutParams(-1, -2))
      addView(number, LinearLayout.LayoutParams(-1, dp(64)).apply { topMargin = dp(24) })
      addView(call, LinearLayout.LayoutParams(-1, dp(56)).apply { topMargin = dp(16) })
    })
  }
}
