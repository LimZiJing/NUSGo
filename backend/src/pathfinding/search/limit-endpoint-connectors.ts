export function limitEndpointConnectors<T>(
  rankedCandidates: readonly T[],
  maximumCount: number,
  preferredStopId: string | null | undefined,
  getStopId: (candidate: T) => string,
): T[] {
  const preferredIndex = preferredStopId
    ? rankedCandidates.findIndex((candidate) => getStopId(candidate) === preferredStopId)
    : -1
  if (preferredIndex < 0) return rankedCandidates.slice(0, maximumCount)

  const preferred = rankedCandidates[preferredIndex]!
  const orderedCandidates = [
    preferred,
    ...rankedCandidates.slice(0, preferredIndex),
    ...rankedCandidates.slice(preferredIndex + 1),
  ]
  return orderedCandidates.slice(0, maximumCount)
}
