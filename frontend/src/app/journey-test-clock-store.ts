export function createJourneyTestClockStore() {
  let departureMs: number | null = null
  return {
    get: () => departureMs,
    set: (value: number | null) => { departureMs = value },
  }
}
