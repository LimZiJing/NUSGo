import { validateWalkingStopGraph } from '@navus/shared/routing/walking-stop-graph'
import { fetchJson } from '../data/json.ts'


export type WalkingStopGraphLoader = (signal: AbortSignal) => Promise<import('@navus/shared/routing/walking-stop-graph').WalkingStopGraph>

export function loadWalkingStopGraph(
  signal: AbortSignal,
): Promise<import('@navus/shared/routing/walking-stop-graph').WalkingStopGraph> {
  return fetchJson('/data/walking-stop-graph.json', signal, 'Walking stop graph')
    .then(validateWalkingStopGraph)
}
