export type KazakhstanFraudOperation = {
  id: string
  title: string
  period: string
  description: string
  signals: string[]
  response: string[]
  source: string
}

// Public official alerts are used as taxonomy evidence, not as a claim that
// every call matching a phrase is fraudulent. The live engine still requires
// multiple signals for the operation-specific rules.
export const recentKazakhstanFraudOperations: KazakhstanFraudOperation[] = [
  {
    id: 'loan-rescue-2026',
    title: 'Fake National Bank + loan rescue',
    period: '2026',
    description: 'Caller claims an online loan was opened in the victim\'s name and demands a new loan or transfer to a safe account.',
    signals: ['National Bank impersonation', 'online loan on your name', 'new loan', 'safe account'],
    response: ['End the call', 'Do not take a new loan', 'Call the bank using its official app or card'],
    source: 'https://nationalbank.kz/ru/news/informacionnye-soobshcheniya/19505',
  },
  {
    id: 'telecom-malware-2025',
    title: 'Fake Kazakhtelecom + malicious file',
    period: '2025',
    description: 'Caller invents an expiring contract or discount and sends a file, link or APK that can enable remote access to banking apps.',
    signals: ['Kazakhtelecom impersonation', 'contract expiry', 'internet discount', 'APK/file install'],
    response: ['Do not open or install the file', 'Disconnect internet if opened', 'Contact the operator and bank independently'],
    source: 'https://www.gov.kz/memleket/entities/qriim/press/news/details/1149158',
  },
  {
    id: 'dropper-recruitment-2026',
    title: 'Dropper recruitment and bank-access sale',
    period: '2026',
    description: 'Recruiter offers money for a bank card or online-banking access, often through a Telegram curator, then routes funds or crypto.',
    signals: ['rent a card', 'share online banking', 'payment per transaction', 'Telegram curator', 'crypto cash-out'],
    response: ['Do not share access', 'Call the bank to freeze the account', 'Report the recruiter'],
    source: 'https://www.gov.kz/memleket/entities/afm/press/news/details/1256798',
  },
  {
    id: 'spoofed-call-infrastructure-2026',
    title: 'Spoofed local caller ID and virtual stations',
    period: '2026',
    description: 'Fraud infrastructure can use international routing, virtual phone stations and local-looking mobile numbers.',
    signals: ['unverified caller', 'number shown as local', 'international routing', 'virtual station'],
    response: ['Do not trust the displayed number', 'Hang up and dial the official number yourself'],
    source: 'https://www.gov.kz/memleket/entities/knb/press/news/details/1210123',
  },
]
