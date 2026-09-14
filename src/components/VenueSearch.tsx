import { useMemo, useState } from 'react'
import { searchVenues, type VenueSearchResult } from '../venue/search'
import type { VenueLocationMap } from '../types/venues'

interface VenueSearchProps {
  venues: VenueLocationMap | null
  onSelect: (result: VenueSearchResult) => void
}

export function VenueSearch({ venues, onSelect }: VenueSearchProps) {
  const [query, setQuery] = useState('')
  const results = useMemo(
    () => (venues ? searchVenues(venues, query) : []),
    [query, venues],
  )
  const showResults = query.trim().length > 0

  return (
    <section className="venue-search" aria-label="Search venues">
      <label htmlFor="venue-search-input">Find a venue</label>
      <div className="venue-search-row">
        <input
          id="venue-search-input"
          type="search"
          placeholder="e.g. COM1-0210"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear venue search">
            Clear
          </button>
        )}
      </div>
      {showResults && (
        <div className="venue-search-results" role="status">
          {results.length > 0 ? (
            results.map((result) => (
              <button
                className="venue-result"
                type="button"
                key={result.code}
                onClick={() => onSelect(result)}
              >
                <strong>{result.code}</strong>
                <span>{result.venue.roomName}</span>
              </button>
            ))
          ) : (
            <p className="venue-search-empty">No matching venues</p>
          )}
        </div>
      )}
    </section>
  )
}
