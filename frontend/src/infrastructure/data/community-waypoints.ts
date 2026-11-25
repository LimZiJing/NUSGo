import { parseCommunityWaypointsGeoJson } from '@nusgo/shared/waypoints/community-geojson'
import type { CommunityWaypoint } from '@nusgo/shared/waypoints/community'
import { fetchJson } from './json'
import type { JsonFetcher } from './loaders'

export async function loadCommunityWaypoints(
  signal: AbortSignal,
  fetcher: JsonFetcher = fetchJson,
): Promise<readonly CommunityWaypoint[]> {
  const input = await fetcher('/data/community-waypoints.geojson', signal, 'Community waypoints')
  return parseCommunityWaypointsGeoJson(input)
}
