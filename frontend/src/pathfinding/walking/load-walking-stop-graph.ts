import { validateWalkingStopGraph } from '@navus/shared/routing/walking-stop-graph'


export type WalkingStopGraphLoader = (signal: AbortSignal) => Promise<import('@navus/shared/routing/walking-stop-graph').WalkingStopGraph>

export async function loadWalkingStopGraph(
  signal: AbortSignal,
): Promise<import('@navus/shared/routing/walking-stop-graph').WalkingStopGraph> {
  const resourcePath = `${import.meta.env.BASE_URL}data/walking-stop-graph.json`
  const response = await fetch(resourcePath, { signal })
  if (!response.ok) {
    throw new Error(`Walking stop graph request failed: ${response.status}`)
  }

  // Keep untrusted static JSON inside the walking boundary until the shared validator accepts it.
  const payload: unknown = await response.json()
  return validateWalkingStopGraph(payload)
}
