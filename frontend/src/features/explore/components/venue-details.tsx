import type { RefObject } from 'react'
import type { VenueSearchResult } from '../../../domain/venue/search'
import { findNearbyShuttleStops, type TransitIndex } from '../../../domain/transit'
import { formatVenueFloorAndBuilding, getVenueBuildingName, hasVenueCoordinates } from '../../../domain/venue/details'
import nusmodsLogoUrl from '../../../ui/brand-assets/nusmods-logo.svg'
import { BuildingIcon, BusIcon, ChevronRightIcon } from '../../../ui/icons'
import { MobileMapDetailOverlay } from '../../../ui/mobile/mobile-map-detail-overlay'
import { NavigateButton } from '../../../ui/navigate-button'
import { RouteChipBadge } from '../../../ui/route-chip'
import '../styles/venue-details.css'

interface VenueDetailsProps {
  readonly venue: VenueSearchResult
  readonly transitIndex: TransitIndex | null
  readonly headingRef: RefObject<HTMLHeadingElement | null>
  readonly onNavigateToVenue?: (venueCode: string) => void
  readonly onFocusStop: (stopId: string, focusTarget?: HTMLElement) => void
  readonly mobileMapDetailOverlay?: boolean
  readonly backLabel?: string
  readonly onBack?: () => void
}

export function VenueDetails({
  venue,
  transitIndex,
  headingRef,
  onNavigateToVenue,
  onFocusStop,
  mobileMapDetailOverlay = false,
  backLabel = 'Find venue',
  onBack,
}: VenueDetailsProps) {
  const hasCoordinates = hasVenueCoordinates(venue.venue)
  const transitAvailable = transitIndex !== null
  const floorAndBuilding = formatVenueFloorAndBuilding(
    venue.venue.floor,
    getVenueBuildingName(venue.code),
  )
  const venueLocation = venue.venue.location
  const nearbyStops = hasCoordinates && venueLocation && transitIndex
    ? findNearbyShuttleStops(venueLocation, transitIndex)
    : []
  const venueSubtitle = [venue.venue.roomName, floorAndBuilding].filter(Boolean).join(' · ')
  const venueHeading = (
    <h3
      id="explore-venue-detail-heading"
      ref={headingRef}
      className={mobileMapDetailOverlay ? 'mobile-detail-title' : undefined}
      tabIndex={-1}
      aria-label={`${venue.code}, venue`}
    >
      {!mobileMapDetailOverlay && (
        <BuildingIcon className="location-identity-icon location-identity-icon--venue" />
      )}
      <span>{venue.code}</span>
    </h3>
  )
  const nusmodsLink = (
    <a
      className="venue-detail-action venue-detail-nusmods"
      href={`https://nusmods.com/venues/${encodeURIComponent(venue.code)}`}
      target="_blank"
      rel="noreferrer"
    >
      <span>View in</span>
      <img src={nusmodsLogoUrl} alt="NUSMods" />
    </a>
  )
  const nearbyStopsContent = !transitAvailable ? (
    <p className="venue-nearby-empty" role="status">Nearby stops are unavailable right now.</p>
  ) : nearbyStops.length === 0 ? (
    <p className="venue-nearby-empty" role="status">No NUS bus stops within 500 m.</p>
  ) : (
    <div className="venue-nearby-stop-list">
      {nearbyStops.map(({ stop, services }) => (
        <button
          key={stop.id}
          className={`nearby-stop-row${mobileMapDetailOverlay ? ' mobile-detail-card' : ''}`}
          type="button"
          data-stop-id={stop.id}
          aria-label={`Nearby bus stop ${stop.longName}, code ${stop.id}, services ${services.map(({ id }) => id).join(', ')}. View stop details`}
          onClick={(event) => onFocusStop(stop.id, event.currentTarget)}
        >
          <span className="nearby-stop-identity">
            <span className="nearby-stop-name">
              <BusIcon className="location-identity-icon location-identity-icon--stop" />
              <strong>{stop.longName}</strong>
              <small>{stop.id}</small>
            </span>
          </span>
          <span className="nearby-stop-services" aria-hidden="true">
            {services.map((route) => (
              <RouteChipBadge
                key={route.id}
                routeId={route.id}
                routeColor={route.color}
              />
            ))}
          </span>
          <ChevronRightIcon className="nearby-stop-arrow" />
        </button>
      ))}
    </div>
  )

  if (mobileMapDetailOverlay) {
    return (
      <MobileMapDetailOverlay
        id="explore-content-panel"
        label={`Venue details for ${venue.code}`}
        backLabel={backLabel}
        onBack={() => onBack?.()}
        identity={(
          <div className="mobile-detail-identity">
            <BuildingIcon className="location-identity-icon location-identity-icon--venue" />
            <div className="mobile-detail-identity-text">
              {venueHeading}
              {venueSubtitle && <p className="mobile-detail-subtitle">{venueSubtitle}</p>}
            </div>
          </div>
        )}
        headerAction={(
          <NavigateButton
            ariaLabel="Navigate to this venue"
            disabled={!hasCoordinates}
            onClick={() => onNavigateToVenue?.(venue.code)}
          />
        )}
        bottomLabel={hasCoordinates ? 'Nearby bus stops' : 'Venue actions'}
        bottomHeading={(
          <div className="venue-detail-bottom-heading-row">
            {hasCoordinates && (
              <h4 id="venue-nearby-stops-heading">
                <BusIcon />
                Nearby bus stops · 500 m
              </h4>
            )}
            {nusmodsLink}
          </div>
        )}
        bottom={hasCoordinates ? (
          <section className="venue-nearby-stop-content" aria-labelledby="venue-nearby-stops-heading">
            {nearbyStopsContent}
          </section>
        ) : undefined}
      />
    )
  }

  return (
    <div id="explore-content-panel" className="explore-content-panel explore-content-detail navigation-panel-content navigation-panel-scroll-content">
      <div className="venue-detail-identity">
        {venueHeading}
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
        {nusmodsLink}
      </div>
      {hasCoordinates && (
        <section className="venue-nearby-stops" aria-labelledby="venue-nearby-stops-heading">
          <h4 id="venue-nearby-stops-heading">
            <BusIcon />
            Nearby bus stops within 500 m
          </h4>
          {nearbyStopsContent}
        </section>
      )}
    </div>
  )
}
