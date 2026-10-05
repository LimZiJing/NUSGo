import type { PanelStatus } from '../features/explore-view/status'
import type { ResourceStatusState } from './resource-status'

export function deriveExploreViewStatus(
  resourceStatus: ResourceStatusState,
  mapError: string | null,
  startupFailure: { readonly message: string } | null,
): PanelStatus | null {
  const failures = [
    startupFailure?.message ?? null,
    mapError,
    resourceStatus.venue.status === 'failed' ? resourceStatus.venue.message : null,
    resourceStatus.transit.status === 'failed' ? resourceStatus.transit.message : null,
  ].filter((message): message is string => Boolean(message))

  if (failures.length > 0) {
    return { kind: 'failure', message: failures.join('; ') }
  }

  if (
    resourceStatus.venue.status !== 'loaded' ||
    resourceStatus.transit.status !== 'loaded'
  ) {
    return { kind: 'loading', message: 'Loading map data…' }
  }

  return null
}
