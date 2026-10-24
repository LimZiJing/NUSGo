import { useMemo, type MouseEvent, type RefObject } from 'react'
import type { VenueSearchResult } from '../../../domain/venue/search'
import { searchExplore, type ExploreSearchResult } from '../../../domain/venue/explore-search'
import { EMPTY_BUILDING_INDEX, describeBuildingEntry, type BuildingIndex } from '../../../domain/venue/building-index'
import type { BuildingVenueLinks } from '../../../domain/venue/building-links'
import type { TransitIndex } from '../../../domain/transit'
import type { TransitStop } from '@nusgo/shared/transit/types'
import type { VenueLocationMap } from '@nusgo/shared/venue/types'
import { BuildingIcon, BusIcon, CloseIcon, RoomIcon, SearchIcon } from '../../../ui/icons'
import { IconButton } from '../../../ui/button'
import { ScrollArea } from '../../../ui/scroll-area'
import { SearchField } from '../../../ui/search-field'

/** Short name and ID as secondary text, shown only when the short name differs from the ID. */
function getStopSecondaryText(stop: TransitStop): string | null {
  const shortName = stop.shortName.trim()
  if (!shortName || shortName.toLocaleLowerCase() === stop.id.trim().toLocaleLowerCase()) return null
  return `${shortName}, ${stop.id}`
}

interface VenueSearchProps {
  readonly venues: VenueLocationMap | null
  readonly buildings: BuildingIndex | null
  readonly buildingLinks: BuildingVenueLinks
  readonly transitIndex?: TransitIndex | null
  readonly query: string
  readonly minimized: boolean
  readonly inputRef: RefObject<HTMLInputElement | null>
  readonly onRestore?: () => void
  readonly onSearchFocus?: () => void
  readonly onQueryChange: (query: string) => void
  readonly onSelect: (result: VenueSearchResult, event: MouseEvent<HTMLButtonElement>) => void
  readonly onBuildingSelect: (buildingId: string, event: MouseEvent<HTMLButtonElement>) => void
  readonly onStopSelect?: (stopId: string, event: MouseEvent<HTMLButtonElement>) => void
}

export function VenueSearch({
  venues,
  buildings,
  buildingLinks,
  transitIndex = null,
  query,
  minimized,
  inputRef,
  onRestore,
  onSearchFocus,
  onQueryChange,
  onSelect,
  onBuildingSelect,
  onStopSelect,
}: VenueSearchProps) {
  const searchState = useMemo((): { results: ExploreSearchResult[]; failed: boolean } => {
    if (!venues) return { results: [], failed: false }

    try {
      return {
        results: searchExplore(
          { venues, buildings: buildings ?? EMPTY_BUILDING_INDEX, links: buildingLinks, stops: transitIndex },
          query,
        ),
        failed: false,
      }
    } catch (error) {
      // Venue data is independent from bus route browsing, so search failures leave route controls available.
      console.error('Venue search failed:', error)
      return { results: [], failed: true }
    }
  }, [query, venues, buildings, buildingLinks, transitIndex])

  return (
    <div id="explore-content-panel" className="explore-content-panel">
      <div className="explore-content-search-row">
        <SearchField
          id="explore-venue-search-input"
          aria-labelledby="explore-content-heading"
          placeholder="e.g. COM1-0210"
          value={query}
          inputRef={inputRef}
          onFocus={() => {
            if (minimized) onRestore?.()
            onSearchFocus?.()
          }}
          onChange={(event) => onQueryChange(event.target.value)}
          autoComplete="off"
        />
        {query && (
          <IconButton
            variant="plain"
            className="explore-content-search-clear"
            label="Clear venue search"
            icon={<CloseIcon />}
            onClick={() => {
              onQueryChange('')
              inputRef.current?.focus()
            }}
          />
        )}
      </div>
      <div className="navigation-panel-content explore-content-search-body">
        {!venues || searchState.failed ? (
          <p className="explore-content-status" role="status" aria-live="polite">
            Venue search is unavailable right now. Bus route browsing is still available.
          </p>
        ) : query.trim() ? (
          <ScrollArea className="navigation-panel-scroll-content explore-content-results" aria-label="Venue search results">
            {searchState.results.length > 0 ? (
              searchState.results.map((item) => {
                if (item.kind === 'stop') {
                  const { stop } = item
                  const secondary = getStopSecondaryText(stop)
                  return (
                    <button
                      className="explore-content-result"
                      data-focus-id={`stop-result-${stop.id}`}
                      type="button"
                      key={`stop:${stop.id}`}
                      onClick={(event) => onStopSelect?.(stop.id, event)}
                      aria-label={`${stop.longName}, bus stop, code ${stop.id}`}
                    >
                      <span className="explore-content-result-identity">
                        <BusIcon className="location-identity-icon location-identity-icon--stop" />
                        <strong>{stop.longName}</strong>
                      </span>
                      {secondary && <span>{secondary}</span>}
                    </button>
                  )
                }
                if (item.kind === 'building') {
                  const { entry } = item
                  const secondary = describeBuildingEntry(entry)
                  return (
                    <button
                      className="explore-content-result"
                      data-focus-id={`building-result-${entry.id}`}
                      type="button"
                      key={`building:${entry.id}`}
                      onClick={(event) => onBuildingSelect(entry.id, event)}
                      aria-label={secondary ? `${entry.name}, building, ${secondary}` : `${entry.name}, building`}
                    >
                      <span className="explore-content-result-identity">
                        <BuildingIcon className="location-identity-icon location-identity-icon--building" />
                        <strong>{entry.name}</strong>
                      </span>
                      {secondary && <span>{secondary}</span>}
                    </button>
                  )
                }
                const { result } = item
                return (
                  <button
                    className="explore-content-result"
                    data-focus-id={`venue-result-${result.code}`}
                    type="button"
                    key={`venue:${result.code}`}
                    onClick={(event) => onSelect(result, event)}
                    aria-label={`${result.code}, venue, ${result.venue.roomName}`}
                  >
                    <span className="explore-content-result-identity">
                      <RoomIcon className="location-identity-icon location-identity-icon--venue" />
                      <strong>{result.code}</strong>
                    </span>
                    <span>{result.venue.roomName}</span>
                  </button>
                )
              })
            ) : (
              <p className="explore-content-status" role="status" aria-live="polite">No matching venues or bus stops.</p>
            )}
          </ScrollArea>
        ) : (
          <div className="explore-content-search-prompt">
            <SearchIcon />
            <p>Search for a venue</p>
          </div>
        )}
      </div>
    </div>
  )
}
