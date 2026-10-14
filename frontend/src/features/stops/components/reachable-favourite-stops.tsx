import { FavoriteIcon } from '../../../ui/icons'
import type { StopFavouriteDestination } from '../data/stop-timing-data'

export function ReachableFavouriteStops({
  stops,
}: {
  readonly stops: readonly StopFavouriteDestination[]
}) {
  if (stops.length === 0) return null

  return (
    <span
      role="list"
      aria-label="Reachable favourite bus stops"
      className="stop-reachable-favourites"
    >
      <span className="stop-reachable-favourites-arrow" aria-hidden="true">→</span>
      {stops.map(({ id, name, isOpposite }) => (
        <span
          role="listitem"
          key={id}
          className="stop-reachable-favourite"
          data-opposite={isOpposite ? 'true' : undefined}
          aria-label={`${name}, bus stop, ${id}`}
        >
          <FavoriteIcon filled />
          <span>{name}</span>
        </span>
      ))}
    </span>
  )
}
