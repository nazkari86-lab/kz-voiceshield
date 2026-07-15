package kz.voiceshield

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.telecom.Call
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

class VoiceShieldCallActivity : Activity(), VoiceShieldCallController.Listener {
  private lateinit var title: TextView
  private lateinit var number: TextView
  private lateinit var risk: TextView
  private lateinit var reasons: TextView
  private lateinit var answer: Button
  private lateinit var end: Button
  private var muted = false
  private var speaker = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_SECURE)
    setContentView(buildContent())
    VoiceShieldCallController.addListener(this)
  }

  override fun onDestroy() {
    VoiceShieldCallController.removeListener(this)
    super.onDestroy()
  }

  override fun onCallChanged(call: Call?) = runOnUiThread {
    if (call == null) {
      finishAndRemoveTask()
      return@runOnUiThread
    }
    val rawNumber = call.details.handle?.schemeSpecificPart.orEmpty()
    val assessment = PhoneReputationStore.assess(this, rawNumber, "unverified", false)
    val annotation = assessment.annotation
    val deviceLocked = getSystemService(KeyguardManager::class.java).isDeviceLocked
    title.text = when {
      annotation.label.isNotBlank() && !deviceLocked -> annotation.label
      annotation.familyProtected -> "Family call"
      call.state == Call.STATE_RINGING -> "Incoming call"
      else -> "Protected call"
    }
    number.text = rawNumber.ifBlank { "Hidden number" }
    risk.text = "Risk ${assessment.result.score}/100  ·  Trust ${assessment.result.trustRating}/100" +
      if (annotation.rating > 0) "  ·  Your rating ${annotation.rating}/5" else ""
    risk.setTextColor(if (assessment.result.score >= 65) Color.rgb(220, 38, 38) else Color.rgb(16, 185, 129))
    reasons.text = buildList {
      if (!deviceLocked && annotation.relationship != "unknown") add(annotation.relationship.replaceFirstChar { it.uppercase() })
      if (!deviceLocked && annotation.comment.isNotBlank()) add(annotation.comment)
      addAll(assessment.result.reasons)
    }.joinToString("\n• ", prefix = "• ")
    answer.visibility = if (call.state == Call.STATE_RINGING) View.VISIBLE else View.GONE
    end.text = if (call.state == Call.STATE_RINGING) "Reject" else "End call"
  }

  private fun buildContent(): View {
    val density = resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()
    fun text(value: String, size: Float, bold: Boolean = false) = TextView(this).apply {
      this.text = value
      textSize = size
      setTextColor(Color.rgb(241, 245, 249))
      if (bold) setTypeface(typeface, Typeface.BOLD)
    }
    fun button(label: String, color: Int, action: (Button) -> Unit) = Button(this).apply {
      text = label
      setTextColor(Color.WHITE)
      setBackgroundColor(color)
      setOnClickListener { action(this) }
    }
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(24), dp(48), dp(24), dp(24))
      setBackgroundColor(Color.rgb(9, 18, 32))
    }
    title = text("Protected call", 28f, true)
    number = text("", 20f)
    risk = text("Checking number…", 16f, true)
    reasons = text("", 14f)
    listOf(title, number, risk, reasons).forEach {
      it.gravity = Gravity.CENTER
      it.setPadding(0, dp(8), 0, dp(8))
      root.addView(it, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    }
    val controls = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
    answer = button("Answer", Color.rgb(5, 150, 105)) { VoiceShieldCallController.answer() }
    end = button("Reject", Color.rgb(220, 38, 38)) {
      val call = VoiceShieldCallController.call
      if (call?.state == Call.STATE_RINGING) VoiceShieldCallController.reject() else VoiceShieldCallController.disconnect()
    }
    controls.addView(answer, LinearLayout.LayoutParams(0, dp(56), 1f).apply { marginEnd = dp(6) })
    controls.addView(end, LinearLayout.LayoutParams(0, dp(56), 1f).apply { marginStart = dp(6) })
    root.addView(controls, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(28) })
    val tools = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
    val mute = button("Mute", Color.rgb(51, 65, 85)) { pressed ->
      muted = !muted
      VoiceShieldCallController.setMuted(muted)
      pressed.text = if (muted) "Unmute" else "Mute"
    }
    val speakerButton = button("Speaker", Color.rgb(51, 65, 85)) { pressed ->
      speaker = !speaker
      VoiceShieldCallController.setSpeaker(speaker)
      pressed.text = if (speaker) "Earpiece" else "Speaker"
    }
    tools.addView(mute, LinearLayout.LayoutParams(0, dp(52), 1f).apply { marginEnd = dp(6) })
    tools.addView(speakerButton, LinearLayout.LayoutParams(0, dp(52), 1f).apply { marginStart = dp(6) })
    root.addView(tools, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(12) })
    root.addView(button("Open live fraud analysis", Color.rgb(37, 99, 235)) {
      startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
    }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(52)).apply { topMargin = dp(20) })
    return ScrollView(this).apply { addView(root) }
  }
}
