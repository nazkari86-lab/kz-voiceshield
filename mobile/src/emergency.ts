export type ExposureType = 'card' | 'otp' | 'pin' | 'iin' | 'password' | 'remote'

export type RecoveryPlan = {
  id: ExposureType
  title: string
  urgency: string
  steps: string[]
}

export const recoveryPlans: RecoveryPlan[] = [
  { id: 'card', title: 'Card details', urgency: 'Act now', steps: ['Freeze the card in the official bank app.', 'Call the number printed on the card or listed in Verify.', 'Review recent operations and dispute unknown payments.', 'Request card replacement if the full number and expiry were exposed.'] },
  { id: 'otp', title: 'SMS or app code', urgency: 'Critical', steps: ['Call the bank fraud line immediately.', 'Block active sessions and payment operations.', 'Change the banking password from a trusted device.', 'Preserve the call number, messages and operation timestamps.'] },
  { id: 'pin', title: 'PIN or CVV', urgency: 'Critical', steps: ['Freeze and replace the card immediately.', 'Do not attempt a test payment.', 'Check cash withdrawals and online operations.', 'Report unauthorized operations to the bank.'] },
  { id: 'iin', title: 'IIN or identity data', urgency: 'High', steps: ['Change passwords on eGov and financial services.', 'Enable login alerts and multi-factor authentication.', 'Check for unfamiliar loans or applications.', 'Keep evidence for a police or bank report.'] },
  { id: 'password', title: 'Account password', urgency: 'High', steps: ['Change it from a trusted device.', 'Sign out all other sessions.', 'Change every account that reused the password.', 'Enable app-based multi-factor authentication.'] },
  { id: 'remote', title: 'Remote-access application', urgency: 'Critical', steps: ['Disconnect the phone from the internet.', 'Uninstall the remote-access app and revoke accessibility permissions.', 'From another trusted device, call the bank and change passwords.', 'Check device administrator apps and recent transactions.'] },
]
