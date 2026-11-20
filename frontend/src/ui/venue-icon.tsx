import type { Venue } from '@nusgo/shared/venue/types'
import {
  CoffeeIcon,
  CookingPotIcon,
  RoomIcon,
  UtensilsIcon,
} from './icons'

export function VenueIcon({ venue }: { readonly venue: Venue }) {
  if (venue.kind === 'room') {
    return <RoomIcon className="location-identity-icon location-identity-icon--venue" />
  }

  switch (venue.foodType) {
    case 'canteen':
      return <CookingPotIcon className="location-identity-icon location-identity-icon--food" />
    case 'restaurant':
      return <UtensilsIcon className="location-identity-icon location-identity-icon--food" />
    case 'drinks & snacks':
      return <CoffeeIcon className="location-identity-icon location-identity-icon--food" />
    default:
      return assertNever(venue.foodType)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported Food type: ${String(value)}`)
}
