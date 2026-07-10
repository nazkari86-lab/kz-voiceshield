export type OfficialOrganization = {
  id: string
  name: string
  phone: string
  website: string
  source: string
  verifiedAt: string
}

export const officialOrganizations: OfficialOrganization[] = [
  { id: 'kaspi', name: 'Kaspi Bank', phone: '9999', website: 'https://guide.kaspi.kz/', source: 'Kaspi Guide', verifiedAt: '2026-07-10' },
  { id: 'halyk', name: 'Halyk Bank', phone: '7111', website: 'https://halykbank.kz/ru/contacts', source: 'Halyk contacts', verifiedAt: '2026-07-10' },
  { id: 'forte', name: 'ForteBank', phone: '7575', website: 'https://forte.kz/ru/information', source: 'Forte information', verifiedAt: '2026-07-10' },
  { id: 'bcc', name: 'Bank CenterCredit', phone: '505', website: 'https://www.bcc.kz/about/contacts/', source: 'BCC contacts', verifiedAt: '2026-07-10' },
]
