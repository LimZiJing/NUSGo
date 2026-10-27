import { useState, type RefObject } from 'react'
import type { VenueSearchResult } from '../../../domain/venue/search'
import { findNearbyShuttleStops, type TransitIndex } from '../../../domain/transit'
import { formatVenueFloorAndBuilding, getVenueBuildingName, hasVenueCoordinates } from '../../../domain/venue/details'
import { getRouteContrastTextColor } from '../../../domain/transit/route-color'
import nusmodsLogoUrl from '../../../ui/brand-assets/nusmods-logo.svg'
import { NavigateButton } from '../../../ui/navigate-button'
import { Select } from '../../../ui/select'
import type { BuildingEntry } from '../../../domain/venue/building-index'
import type { VenueLocation } from '@nusgo/shared/venue/types'
import { BuildingIcon, BusIcon, ChevronRightIcon, RoomIcon } from '../../../ui/icons'

interface VenueDetailsProps {
  readonly venue: VenueSearchResult
  readonly transitIndex: TransitIndex | null
  readonly headingRef: RefObject<HTMLHeadingElement | null>
  readonly onNavigateToVenue?: (venueCode: string) => void
  readonly onFocusStop: (stopId: string, focusTarget?: HTMLElement) => void
}

interface NearbyStopsProps {
  readonly location: VenueLocation['location']
  readonly transitIndex: TransitIndex | null
  readonly onFocusStop: (stopId: string, focusTarget?: HTMLElement) => void
}

function NearbyStops({ location, transitIndex, onFocusStop }: NearbyStopsProps) {
  const transitAvailable = transitIndex !== null
  const nearbyStops = transitIndex ? findNearbyShuttleStops(location, transitIndex) : []

  return (
    <section className="venue-nearby-stops" aria-labelledby="venue-nearby-stops-heading">
      <h4 id="venue-nearby-stops-heading">
        <BusIcon />
        Nearby bus stops within 250 m
      </h4>
      {!transitAvailable ? (
        <p className="venue-nearby-empty" role="status">Nearby stops are unavailable right now.</p>
      ) : nearbyStops.length === 0 ? (
        <p className="venue-nearby-empty" role="status">No NUS bus stops within 250 m.</p>
      ) : (
        <div className="venue-nearby-stop-list">
          {nearbyStops.map(({ stop, services }) => (
            <button
              key={stop.id}
              className="nearby-stop-row"
              type="button"
              data-stop-id={stop.id}
              aria-label={`Nearby bus stop ${stop.longName}, code ${stop.id}, services ${services.map(({ id }) => id).join(', ')}. View stop details`}
              onClick={(event) => onFocusStop(stop.id, event.currentTarget)}
            >
              <span className="nearby-stop-identity">
                <span className="nearby-stop-name">
                  <BusIcon className="location-identity-icon location-identity-icon--stop" />
                  <strong>{stop.longName}</strong>
                </span>
                <small>{stop.id}</small>
              </span>
              <span className="nearby-stop-services" aria-hidden="true">
                {services.map((route) => (
                  <span
                    key={route.id}
                    className="venue-detail-service-badge"
                    data-service-id={route.id}
                    style={{
                      backgroundColor: route.color,
                      color: getRouteContrastTextColor(route.color),
                    }}
                  >
                    {route.id}
                  </span>
                ))}
              </span>
              <ChevronRightIcon className="nearby-stop-arrow" />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function NusmodsLink({ venueCode }: { readonly venueCode: string }) {
  return (
    <a
      className="venue-detail-action venue-detail-nusmods"
      href={`https://nusmods.com/venues/${encodeURIComponent(venueCode)}`}
      target="_blank"
      rel="noreferrer"
    >
      <span>View in</span>
      <img src={nusmodsLogoUrl} alt="NUSMods" />
    </a>
  )
}

export function VenueDetails({
  venue,
  transitIndex,
  headingRef,
  onNavigateToVenue,
  onFocusStop,
}: VenueDetailsProps) {
  const hasCoordinates = hasVenueCoordinates(venue.venue)
  const floorAndBuilding = formatVenueFloorAndBuilding(
    venue.venue.floor,
    getVenueBuildingName(venue.code),
  )
  const venueLocation = venue.venue.location

  return (
    <div
      id="explore-content-panel"
      className="navigation-panel-content navigation-panel-scroll-content explore-content-panel explore-content-detail"
    >
      <div className="venue-detail-identity">
        <h3
          id="explore-venue-detail-heading"
          ref={headingRef}
          tabIndex={-1}
          aria-label={`${venue.code}, venue`}
        >
          <RoomIcon className="location-identity-icon location-identity-icon--venue" />
          {venue.code}
        </h3>
        <p className="venue-detail-name">{venue.venue.roomName}</p>
      </div>
      {floorAndBuilding && (
        <p className="venue-detail-location">
          <BuildingIcon className="venue-detail-icon venue-detail-building-icon" />
          <span>{floorAndBuilding}</span>
        </p>
      )}
      <div className="venue-detail-actions">
        <NavigateButton
          disabled={!hasCoordinates}
          onClick={() => onNavigateToVenue?.(venue.code)}
        />
        <NusmodsLink venueCode={venue.code} />
      </div>
      {hasCoordinates && venueLocation && (
        <NearbyStops location={venueLocation} transitIndex={transitIndex} onFocusStop={onFocusStop} />
      )}
    </div>
  )
}

interface BuildingDetailsProps {
  readonly building: BuildingEntry
  readonly roomCount: number
  /** The NUSMods venue page of a building that is itself a venue (for example LT17); absent otherwise. */
  readonly nusmodsVenueCode?: string
  readonly transitIndex: TransitIndex | null
  readonly headingRef: RefObject<HTMLHeadingElement | null>
  readonly onNavigateToBuilding?: (buildingId: string, partId?: string) => void
  /** Called when the Building select changes; null means "All buildings". */
  readonly onSelectPart?: (partId: string | null) => void
  readonly onFocusStop: (stopId: string, focusTarget?: HTMLElement) => void
}

export function BuildingDetails({
  building,
  roomCount,
  nusmodsVenueCode,
  transitIndex,
  headingRef,
  onNavigateToBuilding,
  onSelectPart,
  onFocusStop,
}: BuildingDetailsProps) {
  const { buildings } = building
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null)
  const selectedPart = buildings.find((part) => part.id === selectedPartId) ?? null
  const hasChips = buildings.length > 1 && buildings.every((part) => part.partLabel !== undefined)
  // Buildings that share one address would only repeat it, so say it once.
  const sharedAddress = buildings[0]?.address && buildings.every((part) => part.address === buildings[0].address)
    ? buildings[0].address
    : null
  const navigationTarget = selectedPart ?? null

  return (
    <div
      id="explore-content-panel"
      className="navigation-panel-content navigation-panel-scroll-content explore-content-panel explore-content-detail"
    >
      <div className="venue-detail-identity">
        <h3
          id="explore-venue-detail-heading"
          ref={headingRef}
          tabIndex={-1}
          aria-label={`${building.name}, building`}
        >
          <BuildingIcon className="location-identity-icon location-identity-icon--building" />
          {building.name}
        </h3>
        {sharedAddress && <p className="venue-detail-name">{sharedAddress}</p>}
      </div>
      {!hasChips && buildings.length > 1 && sharedAddress && (
        <p className="venue-building-parts-note">{`${buildings.length} buildings, each marked on the map.`}</p>
      )}
      {!hasChips && buildings.length > 1 && !sharedAddress && (
        <section className="venue-building-parts" aria-labelledby="venue-building-parts-heading">
          <h4 id="venue-building-parts-heading">Buildings in this group</h4>
          <ul>
            {buildings.map((part, index) => (
              <li key={part.id}>{`Part ${index + 1}${part.address ? ` · ${part.address}` : ''}`}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="venue-detail-actions">
        <NavigateButton onClick={() => onNavigateToBuilding?.(building.id, navigationTarget?.id)} />
        {nusmodsVenueCode && <NusmodsLink venueCode={nusmodsVenueCode} />}
        {hasChips && (
          <Select
            className="venue-building-picker"
            label="Building"
            hideLabel
            value={selectedPartId ?? ''}
            options={[
              { value: '', label: 'All buildings' },
              ...buildings.map((part) => ({ value: part.id, label: part.partLabel ?? part.name })),
            ]}
            onChange={(value) => {
              const partId = value || null
              setSelectedPartId(partId)
              onSelectPart?.(partId)
            }}
          />
        )}
      </div>
      <p className="venue-building-parts-note">
        {selectedPart && !sharedAddress && selectedPart.address ? `${selectedPart.address}. ` : ''}
        {selectedPart || roomCount === 0
          ? 'Rooms and facilities are not added yet.'
          : `${roomCount} ${roomCount === 1 ? 'room' : 'rooms'}`}
      </p>
      <NearbyStops location={selectedPart?.location ?? building.location} transitIndex={transitIndex} onFocusStop={onFocusStop} />
    </div>
  )
}
