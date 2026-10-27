import { useLayoutEffect, useRef, useState } from 'react'
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
  const listHeadingRef = useRef<HTMLHeadingElement>(null)
  const emptyMessageRef = useRef<HTMLParagraphElement>(null)
  const actionRowsRef = useRef(new Map<string, HTMLDivElement>())
  const pendingFocusRef = useRef<{
    readonly stopId: string
    readonly action: 'move-up' | 'move-down' | 'remove'
  } | null>(null)
  const editing = editingList && stops.length > 0

  useLayoutEffect(() => {
    const pendingFocus = pendingFocusRef.current
    if (!pendingFocus) return
    pendingFocusRef.current = null

    if (pendingFocus.action === 'remove') {
      const focusTarget = listHeadingRef.current ?? emptyMessageRef.current
      focusTarget?.focus()
      return
    }

    const actionRow = actionRowsRef.current.get(pendingFocus.stopId)
    const selector = pendingFocus.action === 'move-up'
      ? '.settings-favourite-order-up'
      : '.settings-favourite-order-down'
    const preferredTarget = actionRow?.querySelector<HTMLButtonElement>(selector)
    const focusTarget = preferredTarget && !preferredTarget.disabled
      ? preferredTarget
      : actionRow?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    const fallbackTarget = focusTarget ?? listHeadingRef.current
    fallbackTarget?.focus()
  })

  const moveStop = (index: number, direction: -1 | 1): void => {
    const stop = stops[index]
    const neighbor = stops[index + direction]
    if (!stop || !neighbor) return
    pendingFocusRef.current = { stopId: stop.id, action: direction === -1 ? 'move-up' : 'move-down' }
    onMoveFavorite(stop.id, neighbor.id)
    setStatusMessage(`${stop.name} moved ${direction === -1 ? 'up' : 'down'}.`)
  }

  const clearAllStops = (): void => {
    if (!window.confirm('Clear all favourite bus stops?')) return
    pendingFocusRef.current = { stopId: stops[0]?.id ?? '', action: 'remove' }
    onClearFavorites()
    setEditingList(false)
    setStatusMessage('Favourites cleared.')
  }

  return (
    <div className="settings-favourites">
      {stops.length === 0 ? (
        <p ref={emptyMessageRef} tabIndex={-1}>Star a stop in Stops to add it to your favourites.</p>
      ) : (
        <div className="settings-favourite-card">
          <SavedListHeader
            headingRef={listHeadingRef}
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
                    <div
                      className="settings-favourite-row-actions"
                      ref={(element) => {
                        if (element) actionRowsRef.current.set(stop.id, element)
                        else actionRowsRef.current.delete(stop.id)
                      }}
                    >
                      <IconButton
                        className="settings-favourite-order-up"
                        label={`Move ${stop.name} up`}
                        icon={<ChevronDownIcon />}
                        disabled={index === 0}
                        onClick={() => moveStop(index, -1)}
                      />
                      <IconButton
                        className="settings-favourite-order-down"
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
                          pendingFocusRef.current = { stopId: stop.id, action: 'remove' }
                          onRemoveFavorite(stop.id)
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
