import { useMemo, type MouseEvent, type RefObject } from 'react'
import { searchVenues, type VenueSearchResult } from '../../../domain/venue/search'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import { BuildingIcon, CloseIcon, SearchIcon } from '../../../ui/icons'
import { IconButton } from '../../../ui/button'
import { ScrollArea } from '../../../ui/scroll-area'
import { SearchField } from '../../../ui/search-field'

interface VenueSearchProps {
  readonly venues: VenueLocationMap | null
  readonly query: string
  readonly minimized: boolean
  readonly inputRef: RefObject<HTMLInputElement | null>
  readonly onRestore?: () => void
  readonly onSearchFocus?: () => void
  readonly onQueryChange: (query: string) => void
  readonly onSelect: (result: VenueSearchResult, event: MouseEvent<HTMLButtonElement>) => void
}

export function VenueSearch({
  venues,
  query,
  minimized,
  inputRef,
  onRestore,
  onSearchFocus,
  onQueryChange,
  onSelect,
}: VenueSearchProps) {
  const searchState = useMemo(() => {
    if (!venues) return { results: [], failed: false }

    try {
      return { results: searchVenues(venues, query), failed: false }
    } catch (error) {
      // Venue data is independent from bus route browsing, so search failures leave route controls available.
      console.error('Venue search failed:', error)
      return { results: [], failed: true }
    }
  }, [query, venues])

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
              searchState.results.map((result) => (
                <button
                  className="explore-content-result"
                  data-focus-id={`venue-result-${result.code}`}
                  type="button"
                  key={result.code}
                  onClick={(event) => onSelect(result, event)}
                  aria-label={`${result.code}, venue, ${result.venue.roomName}`}
                >
                  <span className="explore-content-result-identity">
                    <BuildingIcon className="location-identity-icon location-identity-icon--venue" />
                    <strong>{result.code}</strong>
                  </span>
                  <span>{result.venue.roomName}</span>
                </button>
              ))
            ) : (
              <p className="explore-content-status" role="status" aria-live="polite">No matching venues.</p>
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
