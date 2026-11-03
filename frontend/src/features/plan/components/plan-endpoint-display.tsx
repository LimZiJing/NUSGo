import type { TripEndpoint } from '../../../domain/trip/types'
import { BuildingIcon, BusIcon, LocateIcon, MapPinIcon, RoomIcon } from '../../../ui/icons'

export function EndpointKindIcon({ kind }: { kind: TripEndpoint['kind'] }) {
  if (kind === 'venue') return <RoomIcon className="location-identity-icon location-identity-icon--venue" />
  if (kind === 'building') return <BuildingIcon className="location-identity-icon location-identity-icon--building" />
  if (kind === 'stop') return <BusIcon className="location-identity-icon location-identity-icon--stop" />
  if (kind === 'personal-waypoint') return <MapPinIcon className="location-identity-icon" />
  return <LocateIcon className="location-identity-icon" />
}
