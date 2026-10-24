// A bus option slower than this multiple of the walking option is not worth showing.
export const MAX_BUS_TO_WALKING_RATIO = 2
// A transfer must save at least this much adjusted time over the best option without one.
export const MIN_TRANSFER_SAVING_SECONDS = 180

export interface CandidateCost {
  readonly adjustedDurationSeconds: number
  readonly boardings: number
}

/** Removes Path candidates that are dominated by walking or by a journey with fewer boardings. */
export function pruneUnworthwhileCandidates<T>(
  items: readonly T[],
  getCost: (item: T) => CandidateCost,
): T[] {
  const costs = items.map(getCost)
  const walkingSeconds = Math.min(
    Number.POSITIVE_INFINITY,
    ...costs.filter((cost) => cost.boardings === 0).map((cost) => cost.adjustedDurationSeconds),
  )
  const simplerSeconds = Math.min(
    Number.POSITIVE_INFINITY,
    ...costs.filter((cost) => cost.boardings <= 1).map((cost) => cost.adjustedDurationSeconds),
  )
  return items.filter((_, index) => {
    const { adjustedDurationSeconds, boardings } = costs[index]!
    if (boardings === 0) return true
    if (adjustedDurationSeconds > walkingSeconds * MAX_BUS_TO_WALKING_RATIO) return false
    return boardings < 2 || adjustedDurationSeconds <= simplerSeconds - MIN_TRANSFER_SAVING_SECONDS
  })
}
