import { useMemo, type MouseEvent, type RefObject } from 'react'
import type { VenueSearchResult } from '../../../domain/venue/search'
import {
  searchExplore,
  type ExploreResultFilter,
  type ExploreSearchResult,
} from '../../../domain/venue/explore-search'
import { getVenueSearchPresentation } from '../../../domain/venue/search'
import { EMPTY_BUILDING_INDEX, describeBuildingEntry, type BuildingIndex } from '../../../domain/venue/building-index'
import type { BuildingVenueLinks } from '../../../domain/venue/building-links'
import type { TransitIndex } from '../../../domain/transit'
import type { TransitStop } from '@nusgo/shared/transit/types'
import type { VenueMap } from '@nusgo/shared/venue/types'
import { BuildingIcon, BusIcon, CloseIcon, SearchIcon } from '../../../ui/icons'
import { Button, IconButton } from '../../../ui/button'
import { ScrollArea } from '../../../ui/scroll-area'
import { SearchField } from '../../../ui/search-field'
import { VenueIcon } from '../../../ui/venue-icon'
import { Selector } from '@astryxdesign/core/Selector'
import { Icon as AstryxIcon } from '@astryxdesign/core/Icon'

const FILTER_OPTIONS: { value: ExploreResultFilter; label: string }[] = [
  { value: 'all', label: 'All places' },
  { value: 'food', label: 'Food & beverage' },
  { value: 'room', label: 'Rooms' },
  { value: 'building', label: 'Buildings' },
  { value: 'stop', label: 'Bus stops' },
]

function getFilterLabel(filter: ExploreResultFilter): string {
  return FILTER_OPTIONS.find((option) => option.value === filter)?.label ?? 'All places'
}

function isExploreResultFilter(value: string): value is ExploreResultFilter {
  return FILTER_OPTIONS.some((option) => option.value === value)
}

/** Short name and ID as secondary text, shown only when the short name differs from the ID. */
function getStopSecondaryText(stop: TransitStop): string | null {
  const shortName = stop.shortName.trim()
  if (!shortName || shortName.toLocaleLowerCase() === stop.id.trim().toLocaleLowerCase()) return null
  return `${shortName}, ${stop.id}`
}

interface VenueSearchProps {
  readonly venues: VenueMap | null
  readonly buildings: BuildingIndex | null
  readonly buildingLinks: BuildingVenueLinks
  readonly transitIndex?: TransitIndex | null
  readonly query: string
  readonly filter: ExploreResultFilter
  readonly minimized: boolean
  readonly inputRef: RefObject<HTMLInputElement | null>
  readonly onRestore?: () => void
  readonly onSearchFocus?: () => void
  readonly onQueryChange: (query: string) => void
  readonly onFilterChange: (filter: ExploreResultFilter) => void
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
  filter,
  minimized,
  inputRef,
  onRestore,
  onSearchFocus,
  onQueryChange,
  onFilterChange,
  onSelect,
  onBuildingSelect,
  onStopSelect,
}: VenueSearchProps) {
  const searchState = useMemo((): { results: ExploreSearchResult[]; failed: boolean } => {
    if (!venues) return { results: [], failed: false }

    try {
      const results = searchExplore(
        { venues, buildings: buildings ?? EMPTY_BUILDING_INDEX, links: buildingLinks, stops: transitIndex },
        query,
        filter,
      )
      return {
        results,
        failed: false,
      }
    } catch (error) {
      // Venue data is independent from bus route browsing, so search failures leave route controls available.
      console.error('Venue search failed:', error)
      return { results: [], failed: true }
    }
  }, [query, filter, venues, buildings, buildingLinks, transitIndex])
  const hasQuery = query.trim().length > 0

  return (
    <div id="explore-content-panel" className="explore-content-panel">
      <div className="explore-content-search-row">
        <div className="explore-content-search-control">
          <SearchField
            id="explore-venue-search-input"
            aria-labelledby="explore-content-heading"
            placeholder="Search places or bus stops"
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
        <Selector
          label={`Filter places: ${getFilterLabel(filter)}`}
          isLabelHidden
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(value) => {
            if (isExploreResultFilter(value)) onFilterChange(value)
          }}
          size="sm"
          variant="secondary"
          presentation="popover"
          startIcon={<AstryxIcon icon="funnel" />}
          renderValue={() => filter === 'all' ? null : <AstryxIcon icon="check" size="sm" color="accent" />}
          containerClassName="explore-content-filter-trigger"
          controlClassName={
            filter === 'all'
              ? 'explore-content-filter-control'
              : 'explore-content-filter-control explore-content-filter-control--active'
          }
        />
      </div>
      <div className="navigation-panel-content explore-content-search-body">
        {!venues || searchState.failed ? (
          <p className="explore-content-status" role="status" aria-live="polite">
            Venue search is unavailable right now. Bus route browsing is still available.
          </p>
        ) : hasQuery || filter !== 'all' ? (
          <ScrollArea className="navigation-panel-scroll-content explore-content-results" aria-label="Venue search results">
            {searchState.results.length > 0 ? (
              searchState.results.map((item) => {
                if (item.kind === 'stop') {
                  const { stop } = item
                  const secondary = getStopSecondaryText(stop)
                  return (
                    <Button
                      className="explore-content-result"
                      data-focus-id={`stop-result-${stop.id}`}
                      type="button"
                      key={`stop:${stop.id}`}
                      onClick={(event) => onStopSelect?.(stop.id, event)}
                      ariaLabel={`${stop.longName}, bus stop, code ${stop.id}`}
                    >
                      <span className="explore-content-result-identity">
                        <BusIcon className="location-identity-icon location-identity-icon--stop" />
                        <strong>{stop.longName}</strong>
                      </span>
                      {secondary && <span>{secondary}</span>}
                    </Button>
                  )
                }
                if (item.kind === 'building') {
                  const { entry } = item
                  const secondary = describeBuildingEntry(entry)
                  return (
                    <Button
                      className="explore-content-result"
                      data-focus-id={`building-result-${entry.id}`}
                      type="button"
                      key={`building:${entry.id}`}
                      onClick={(event) => onBuildingSelect(entry.id, event)}
                      ariaLabel={secondary ? `${entry.name}, building, ${secondary}` : `${entry.name}, building`}
                    >
                      <span className="explore-content-result-identity">
                        <BuildingIcon className="location-identity-icon location-identity-icon--building" />
                        <strong>{entry.name}</strong>
                      </span>
                      {secondary && <span>{secondary}</span>}
                    </Button>
                  )
                }
                const { result } = item
                const presentation = getVenueSearchPresentation(result.code, result.venue)
                const isFood = result.venue.kind === 'food'
                return (
                  <Button
                    className="explore-content-result"
                    data-focus-id={`venue-result-${result.code}`}
                    type="button"
                    key={`venue:${result.code}`}
                    onClick={(event) => onSelect(result, event)}
                    ariaLabel={isFood
                      ? `${presentation.title}, ${presentation.detail}`
                      : `${result.code}, room, ${result.venue.kind === 'room' ? result.venue.roomName : ''}`}
                  >
                    <span className="explore-content-result-identity">
                      <VenueIcon venue={result.venue} />
                      <strong>{presentation.title}</strong>
                    </span>
                    <span>{presentation.detail}</span>
                  </Button>
                )
              })
            ) : (
              <p className="explore-content-status" role="status" aria-live="polite">
                {hasQuery ? 'No matching places or bus stops.' : 'No results for this filter.'}
              </p>
            )}
          </ScrollArea>
        ) : (
          <div className="explore-content-search-prompt">
            <SearchIcon />
            <p>Search for a place or bus stop</p>
          </div>
        )}
      </div>
    </div>
  )
}
