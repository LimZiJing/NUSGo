/** Comparison form: NFKC, lower case, "&" spelt "and", punctuation dropped, whitespace collapsed. */
export function normaliseName(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Normalised form without spaces, so "LT 1" and "LT1" compare equal. */
export function compactName(value: string): string {
  return normaliseName(value).replace(/ /g, '')
}

export function slugify(value: string): string {
  return normaliseName(value).replace(/ /g, '-')
}

/**
 * Codes an API building name may carry: the whole compact name ("E1"), the token before
 * " - " ("MD1 - Tahir Foundation Building") and each "/"-separated token inside a trailing
 * parenthesis ("Lee Wee Kheng Building (S1A/LT 32)").
 */
export function candidateCodes(name: string): string[] {
  const codes = [compactName(name)]
  const dash = name.indexOf(' - ')
  if (dash > 0) codes.push(compactName(name.slice(0, dash)))
  const parenthesis = /\(([^()]*)\)\s*$/.exec(name)
  if (parenthesis) codes.push(...parenthesis[1].split('/').map(compactName))
  return [...new Set(codes.filter((code) => code.length > 0))]
}

/** The building token of a venue code: the part before the first "-" or "_". */
export function roomBuildingToken(venueCode: string): string {
  return venueCode.split(/[-_]/)[0]
}
