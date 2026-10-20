import { compactName } from './normalise.ts'

/** A curated room-code abbreviation for a building whose API name carries no code. */
export type BuildingAlias = {
  readonly prefix: string
  /** The API building name the abbreviation stands for; it must match exactly one record to link. */
  readonly name: string
  /** Why the link is trusted, from names and coordinates in the 13/10/2026 data. */
  readonly evidence: string
}

/**
 * Seeded from the room prefixes that no API name carries as a code (#260). An entry is added
 * only when room names or the initialism point at one API name and the rooms sit beside it;
 * the import still flags any alias match more than 150 m away. Entries whose name repeats in
 * the API (Sheares Hall, Saga, Elm, Cendana) are kept so the report shows them as ambiguous
 * until an override picks a record.
 *
 * Deliberately not aliased, because the data does not settle them: EH (rooms sit at Kent Ridge
 * Hall, not Eusoff Hall), I4 (rooms about 350 m from Innovation 4.0), RH (no
 * hall-level record, only blocks and a communal hall), RVR (seven blocks and a tower), RC4 and
 * TC (several college records), USP, AC, EC, WC and UT (no API name matches).
 */
export const BUILDING_ALIASES: readonly BuildingAlias[] = [
  { prefix: 'CAPT', name: 'College of Alice & Peter Tan', evidence: 'Initialism; room names say "College of Alice and Peter Tan".' },
  { prefix: 'CELC', name: 'Centre for English Language Communication', evidence: 'Initialism; rooms within 10 m of the centroid.' },
  { prefix: 'CELS', name: 'Centre for Life Sciences', evidence: 'NUS abbreviation; rooms within 10 m of the centroid.' },
  { prefix: 'CLB', name: 'Central Library', evidence: 'Room name "Central Library Seminar Room".' },
  { prefix: 'ERC', name: 'Education Resource Centre', evidence: 'Initialism; room names begin "Education Resource Centre".' },
  { prefix: 'HSS', name: 'Hon Sui Sen Memorial Library', evidence: 'Initials of Hon Sui Sen; rooms within 10 m of the centroid.' },
  { prefix: 'KRH', name: 'Kent Ridge Hall', evidence: 'Initialism; one hall-level record, rooms beside it.' },
  { prefix: 'NAK', name: 'Ngee Ann Kongsi Auditorium', evidence: 'Room name "Ngee Ann Kongsi Auditorium".' },
  { prefix: 'RC1', name: 'Saga College', evidence: 'Room names begin "Saga" (classrooms, lecture theatre).' },
  { prefix: 'RC2', name: 'Elm College', evidence: 'Room names begin "Elm" (classrooms, lecture theatre).' },
  { prefix: 'RC3', name: 'Cendana College', evidence: 'Room names begin "Cendana" (classrooms, dance studio).' },
  { prefix: 'SFAH', name: 'Shaw Foundation Alumni House', evidence: 'Initialism; rooms within 20 m of the centroid.' },
  { prefix: 'SH', name: 'Sheares Hall', evidence: 'Initialism; rooms beside the Sheares Hall records.' },
  { prefix: 'TH', name: 'Temasek Hall', evidence: 'Room name "Temasek Hall Office, Seminar Room".' },
  { prefix: 'TP', name: 'Town Plaza', evidence: 'Room names begin "Town Plaza".' },
  { prefix: 'UTSRC', name: 'Stephen Riady Centre', evidence: 'UTown + Stephen Riady Centre initials; rooms within 60 m.' },
  { prefix: 'YI', name: 'Yusof Ishak House', evidence: 'Initials of Yusof Ishak; rooms within 15 m of the centroid.' },
  { prefix: 'YSTCM', name: 'Yong Siew Toh Conservatory of Music', evidence: 'Initialism; rooms within 30 m of the centroid.' },
]

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function validateAliases(aliases: readonly BuildingAlias[]): readonly BuildingAlias[] {
  const issues: string[] = []
  const seen = new Set<string>()
  aliases.forEach((alias, index) => {
    for (const field of ['prefix', 'name', 'evidence'] as const) {
      if (!isNonEmptyString(alias[field])) issues.push(`alias ${index + 1} ${field} must be a non-empty string`)
    }
    const compact = compactName(alias.prefix)
    if (compact.length > 0 && seen.has(compact)) issues.push(`prefix ${alias.prefix} is listed more than once`)
    seen.add(compact)
  })
  if (issues.length > 0) throw new Error(`Building alias table is invalid: ${issues.join('; ')}`)
  return aliases
}
