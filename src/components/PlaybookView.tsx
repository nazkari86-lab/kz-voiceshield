import { FileDown, PhoneCall, ShieldCheck, Smartphone } from 'lucide-react'

export function PlaybookView() {
  return (
    <div className="playbook">
      <article><ShieldCheck size={18} /><div><strong>1. Freeze action</strong><p>Stop transfers, code sharing, screen sharing and app installs immediately.</p></div></article>
      <article><PhoneCall size={18} /><div><strong>2. Verify independently</strong><p>Call the bank, courier, relative or agency through a saved official number.</p></div></article>
      <article><Smartphone size={18} /><div><strong>3. Secure accounts</strong><p>Change passwords, end suspicious sessions and check messenger linked devices.</p></div></article>
      <article><FileDown size={18} /><div><strong>4. Preserve evidence</strong><p>Export this report, keep screenshots, phone numbers, links and timestamps.</p></div></article>
    </div>
  )
}
