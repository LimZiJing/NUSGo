import { useState } from 'react'

export interface FavoriteStopSummary {
  readonly id: string
  readonly name: string
}

interface FavouritesSectionProps {
  readonly stops: readonly FavoriteStopSummary[]
  readonly onRemove: (stopId: string) => void
  readonly onClear: () => void
}

export function FavouritesSection({ stops, onRemove, onClear }: FavouritesSectionProps) {
  const [statusMessage, setStatusMessage] = useState('')

  const removeStop = (stop: FavoriteStopSummary): void => {
    onRemove(stop.id)
    setStatusMessage(`${stop.name} removed from favourites.`)
  }

  const clearAllStops = (): void => {
    if (!window.confirm('Clear all favourite bus stops?')) return
    onClear()
    setStatusMessage('Favourites cleared.')
  }

  return (
    <div className="settings-favourites">
      {stops.length === 0 ? (
        <p>None saved.</p>
      ) : (
        <>
          <ul className="settings-favourite-list">
            {stops.map((stop) => (
              <li className="settings-favourite-row" key={stop.id}>
                <span>{stop.name}</span>
                <button
                  className="settings-favourite-remove"
                  type="button"
                  aria-label={`Remove ${stop.name} from favourites`}
                  onClick={() => removeStop(stop)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button className="settings-action-button" type="button" onClick={clearAllStops}>
            Clear all favourites
          </button>
        </>
      )}
      {statusMessage && <p className="settings-status-message" role="status">{statusMessage}</p>}
    </div>
  )
}
