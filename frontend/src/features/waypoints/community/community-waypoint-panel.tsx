import { useLayoutEffect, useRef } from 'react'
import {
  COMMUNITY_WAYPOINT_READABLE_CATEGORIES,
  type CommunityWaypoint,
  type CommunityWaypointCategory,
} from '@nusgo/shared/waypoints/community'
import { BackButton } from '../../../ui/back-button.tsx'
import { Button } from '../../../ui/button.tsx'
import { MapPinIcon } from '../../../ui/icons'
import type { CommunityWaypointDiscovery } from './use-community-waypoint-discovery'
import './community-waypoint-panel.css'

interface CommunityWaypointPanelProps {
  readonly discovery: CommunityWaypointDiscovery
  readonly onSelectWaypoint: (waypointId: string) => void
  readonly onSuggestCorrection: (waypointId: string, trigger: HTMLButtonElement) => void
  readonly onSuggestWaypoint: (trigger: HTMLButtonElement) => void
}

function getCategoryLabel(category: CommunityWaypointCategory): string {
  return COMMUNITY_WAYPOINT_READABLE_CATEGORIES.find(({ value }) => value === category)?.label ?? 'Community Waypoint'
}

function getFloorLabel(floor: number): string {
  if (floor === 0) return 'Ground floor'
  if (floor < 0) return `Basement ${Math.abs(floor)}`
  return `Floor ${floor}`
}

function WaypointDetails({
  waypoint,
  onBack,
  onSuggestCorrection,
}: {
  readonly waypoint: CommunityWaypoint
  readonly onBack: () => void
  readonly onSuggestCorrection: (waypointId: string, trigger: HTMLButtonElement) => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useLayoutEffect(() => {
    headingRef.current?.focus()
  }, [waypoint.id])

  return (
    <section className="community-waypoint-details" aria-labelledby="community-waypoint-detail-heading">
      <BackButton mode="inline" label="Community Waypoints" onClick={onBack} />
      <div className="community-waypoint-details-scroll">
        <h3 id="community-waypoint-detail-heading" ref={headingRef} tabIndex={-1}>
          {waypoint.name}
        </h3>
        <dl className="community-waypoint-facts">
          <div>
            <dt>Category</dt>
            <dd>{getCategoryLabel(waypoint.category)}</dd>
          </div>
          {waypoint.building && (
            <div>
              <dt>Building</dt>
              <dd>{waypoint.building}{waypoint.floor === undefined ? '' : ` · ${getFloorLabel(waypoint.floor)}`}</dd>
            </div>
          )}
          {waypoint.building === undefined && waypoint.floor !== undefined && (
            <div>
              <dt>Floor</dt>
              <dd>{getFloorLabel(waypoint.floor)}</dd>
            </div>
          )}
          {waypoint.details && (
            <div>
              <dt>Details</dt>
              <dd>{waypoint.details}</dd>
            </div>
          )}
          {waypoint.accessibilityNote && (
            <div>
              <dt>Accessibility</dt>
              <dd>{waypoint.accessibilityNote}</dd>
            </div>
          )}
          <div>
            <dt>Source</dt>
            <dd>{waypoint.source}</dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd><time dateTime={waypoint.updatedAt}>{waypoint.updatedAt}</time></dd>
          </div>
        </dl>
        <div className="community-waypoint-correction-action">
          <Button
            label="Suggest a correction"
            onClick={(event) => onSuggestCorrection(waypoint.id, event.currentTarget)}
          />
        </div>
      </div>
    </section>
  )
}

export function CommunityWaypointPanel({
  discovery,
  onSelectWaypoint,
  onSuggestCorrection,
  onSuggestWaypoint,
}: CommunityWaypointPanelProps) {
  const {
    status,
    waypoints,
    visibleWaypoints,
    categoryOptions,
    visibleCategories,
    selectedWaypoint,
    toggleCategory,
    showAllCategories,
    selectWaypoint,
    clearSelectedWaypoint,
    retry,
  } = discovery

  const allCategoriesVisible = visibleCategories.length === categoryOptions.length
  const noPlaces = waypoints.length === 0

  return (
    <div className="community-waypoint-panel">
      <div className="community-waypoint-browser" hidden={selectedWaypoint !== null}>
        {!(status === 'ready' && noPlaces) && <h3>Community Waypoints</h3>}
        {status === 'loading' && <p className="community-waypoint-status" role="status">Loading approved Community Waypoints…</p>}
        {status === 'failed' && (
          <div className="community-waypoint-load-error">
            <p role="alert">Community Waypoints could not be loaded.</p>
            <Button label="Try again" onClick={retry} />
          </div>
        )}
        {status === 'ready' && (
          <>
            {noPlaces ? (
              <div className="community-waypoint-empty-state">
                <MapPinIcon className="community-waypoint-empty-icon" />
                <p>Know a useful campus location? Suggest it for others.</p>
                <Button
                  label="Suggest a waypoint"
                  variant="secondary"
                  onClick={(event) => onSuggestWaypoint(event.currentTarget)}
                />
              </div>
            ) : (
              <>
                <fieldset className="community-waypoint-filters">
                  <legend>Filter by category</legend>
                  <div className="community-waypoint-filter-list">
                    {categoryOptions.map(({ value, label, count }) => (
                      <button
                        key={value}
                        type="button"
                        className="community-waypoint-filter"
                        aria-pressed={visibleCategories.includes(value)}
                        aria-label={`${label}, ${count} ${count === 1 ? 'waypoint' : 'waypoints'}`}
                        onClick={() => toggleCategory(value)}
                      >
                        <span>{label}</span>
                        <span className="community-waypoint-filter-count" aria-hidden="true">{count}</span>
                      </button>
                    ))}
                    {!allCategoriesVisible && (
                      <button type="button" className="community-waypoint-show-all" onClick={showAllCategories}>
                        Show all waypoints
                      </button>
                    )}
                  </div>
                </fieldset>
                {visibleWaypoints.length === 0 ? (
                  <p className="community-waypoint-empty">No matches.</p>
                ) : (
                  <ul className="community-waypoint-list" aria-label="Approved Community Waypoints">
                    {visibleWaypoints.map((waypoint) => (
                      <li key={waypoint.id}>
                        <button
                          type="button"
                          className="community-waypoint-row"
                          aria-label={`${waypoint.name}, ${getCategoryLabel(waypoint.category)}. Open details.`}
                          onClick={(event) => {
                            selectWaypoint(waypoint.id, event.currentTarget)
                            onSelectWaypoint(waypoint.id)
                          }}
                        >
                          <span className="community-waypoint-row-copy">
                            <strong>{waypoint.name}</strong>
                            <span>{getCategoryLabel(waypoint.category)}{waypoint.building ? ` · ${waypoint.building}` : ''}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </div>
      {selectedWaypoint && (
        <WaypointDetails
          key={selectedWaypoint.id}
          waypoint={selectedWaypoint}
          onBack={clearSelectedWaypoint}
          onSuggestCorrection={onSuggestCorrection}
        />
      )}
    </div>
  )
}
