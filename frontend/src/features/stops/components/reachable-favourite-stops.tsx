import { Popover } from '@base-ui/react/popover'
import { FavoriteIcon } from '../../../ui/icons'
import type { StopFavouriteDestination } from '../data/stop-timing-data'

function DestinationPill({ id, name, isOpposite }: StopFavouriteDestination) {
  return (
    <span
      role="listitem"
      className="stop-reachable-favourite"
      data-opposite={isOpposite ? 'true' : undefined}
      aria-label={`${name}, bus stop, ${id}`}
    >
      <FavoriteIcon filled />
      <span>{name}</span>
    </span>
  )
}

/** Shows the first destination beside the route; any others open from a "+N" button so the row keeps its height. */
export function ReachableFavouriteStops({
  stops,
}: {
  readonly stops: readonly StopFavouriteDestination[]
}) {
  const [first, ...others] = stops
  if (!first) return null

  return (
    <span className="stop-reachable-favourites">
      <span className="stop-reachable-favourites-arrow" aria-hidden="true">→</span>
      <span role="list" aria-label="Reachable favourite bus stops" className="stop-reachable-favourites-list">
        <DestinationPill {...first} />
      </span>
      {others.length > 0 && (
        <Popover.Root>
          <Popover.Trigger
            className="stop-reachable-more"
            aria-label={`Show ${others.length} more reachable favourite bus ${others.length === 1 ? 'stop' : 'stops'}`}
          >
            <span className="stop-reachable-more-label" aria-hidden="true">+{others.length}</span>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner className="stop-reachable-positioner" sideOffset={4} collisionPadding={8}>
              <Popover.Popup className="stop-reachable-popup" aria-label="More reachable favourite bus stops">
                <span role="list" className="stop-reachable-popup-list">
                  {others.map((destination) => (
                    <DestinationPill key={destination.id} {...destination} />
                  ))}
                </span>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      )}
    </span>
  )
}
