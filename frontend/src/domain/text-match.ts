export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase()
}

/** 0 exact, 1 prefix, 2 contains, null no match; the best of the fields wins. */
export function getMatchPriority(fields: readonly string[], query: string): number | null {
  let priority: number | null = null

  for (const field of fields) {
    const normalizedField = normalizeSearchText(field)
    const fieldPriority = normalizedField === query
      ? 0
      : normalizedField.startsWith(query)
        ? 1
        : normalizedField.includes(query)
          ? 2
          : null

    if (fieldPriority !== null && (priority === null || fieldPriority < priority)) {
      priority = fieldPriority
    }
  }

  return priority
}

export function compareText(first: string, second: string): number {
  if (first < second) return -1
  if (first > second) return 1
  return 0
}
