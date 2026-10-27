import { useState } from 'react'
import { Button, IconButton } from '../../../ui/button'
import { ChevronDownIcon, CloseIcon, FavoriteIcon } from '../../../ui/icons'
import { SavedListHeader } from '../../../ui/saved-list-header'
import { SavedListRow } from '../../../ui/saved-list-row'

export interface FavoriteStopSummary {
  readonly id: string
  readonly name: string
}

interface FavouritesSectionProps {
  readonly stops: readonly FavoriteStopSummary[]
  readonly onMoveFavorite: (stopId: string, neighborId: string) => void
  readonly onRemoveFavorite: (stopId: string) => void
  readonly onClearFavorites: () => void
}

export function FavouritesSection({
  stops,
  onMoveFavorite,
  onRemoveFavorite,
  onClearFavorites,
}: FavouritesSectionProps) {
  const [editingList, setEditingList] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const editing = editingList && stops.length > 0

  const moveStop = (index: number, direction: -1 | 1): void => {
    const stop = stops[index]
    const neighbor = stops[index + direction]
    if (!stop || !neighbor) return
    onMoveFavorite(stop.id, neighbor.id)
    setStatusMessage(`${stop.name} moved ${direction === -1 ? 'up' : 'down'}.`)
  }

  const clearAllStops = (): void => {
    if (!window.confirm('Clear all favourite bus stops?')) return
    onClearFavorites()
    setEditingList(false)
    setStatusMessage('Favourites cleared.')
  }

  return (
    <div className="settings-favourites">
      {stops.length === 0 ? (
        <p>Star a stop in Stops to add it to your favourites.</p>
      ) : (
        <div className="settings-favourite-card">
          <SavedListHeader
            title="Favourite stops"
            count={stops.length}
            trailing={(
              <Button
                className="settings-favourites-edit"
                label={editing ? 'Done' : 'Edit list'}
                variant="ghost"
                pressed={editing}
                onClick={() => {
                  const nextEditing = !editing
                  setEditingList(nextEditing)
                  setStatusMessage(nextEditing
                    ? 'Edit list mode. Use the move controls to reorder favourites, or remove a stop.'
                    : 'Done editing the favourites list.')
                }}
              />
            )}
          />
          <div className="settings-favourite-preview">
            <ul className="settings-favourite-list" aria-label="Favourite bus stops">
              {stops.map((stop, index) => (
                <SavedListRow
                  key={stop.id}
                  className="settings-favourite-row"
                  density={editing ? 'regular' : 'compact'}
                  leading={<span className="settings-favourite-icon"><FavoriteIcon filled /></span>}
                  title={stop.name}
                  trailing={editing ? (
                    <div className="settings-favourite-row-actions">
                      <IconButton
                        className="settings-favourite-order-up"
                        label={`Move ${stop.name} up`}
                        icon={<ChevronDownIcon />}
                        disabled={index === 0}
                        onClick={() => moveStop(index, -1)}
                      />
                      <IconButton
                        label={`Move ${stop.name} down`}
                        icon={<ChevronDownIcon />}
                        disabled={index === stops.length - 1}
                        onClick={() => moveStop(index, 1)}
                      />
                      <IconButton
                        className="settings-favourite-remove"
                        label={`Remove ${stop.name} from favourites`}
                        icon={<CloseIcon />}
                        onClick={() => {
                          onRemoveFavorite(stop.id)
                          if (stops.length === 1) setEditingList(false)
                          setStatusMessage(`${stop.name} removed from favourites.`)
                        }}
                      />
                    </div>
                  ) : undefined}
                />
              ))}
            </ul>
          </div>
          {editing && (
            <div className="settings-favourites-actions">
              <Button
                className="settings-favourites-clear"
                label="Clear all"
                variant="secondary"
                onClick={clearAllStops}
              />
            </div>
          )}
        </div>
      )}
      {statusMessage && <p className="settings-status-message" role="status">{statusMessage}</p>}
    </div>
  )
}
