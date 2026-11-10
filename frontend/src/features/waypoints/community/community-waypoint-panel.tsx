import { useLayoutEffect, useRef } from 'react'
import {
  getCommunityWaypointCategoryLabel,
  getCommunityWaypointFloorLabel,
  type ActiveCommunityWaypointCategory,
  type CommunityWaypoint,
  type CommunityWaypointCategory,
} from '@nusgo/shared/waypoints/community'
import { BackButton } from '../../../ui/back-button.tsx'
import { Button, IconButton } from '../../../ui/button.tsx'
import { FileTextIcon, InfoIcon, MapPinIcon, PlusIcon } from '../../../ui/icons'
import { CommunityWaypointCategoryIcon } from './community-waypoint-category-icon'
import { isActiveCommunityWaypointCategory } from './community-waypoint-category-utils'
import type { CommunityWaypointDiscovery } from './use-community-waypoint-discovery'
import './community-waypoint-panel.css'

interface CommunityWaypointPanelProps {
  readonly discovery: CommunityWaypointDiscovery
  readonly onSuggestCorrection: (waypointId: string, trigger: HTMLButtonElement) => void
  readonly onSuggestWaypoint: (
    trigger: HTMLButtonElement,
    category: ActiveCommunityWaypointCategory,
  ) => void
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
  const categoryLabel = getCommunityWaypointCategoryLabel(waypoint.category)

  useLayoutEffect(() => {
    headingRef.current?.focus()
  }, [waypoint.id])

  return (
    <section className="community-waypoint-details" aria-labelledby="community-waypoint-detail-heading">
      <BackButton mode="inline" label="Community Waypoints" onClick={onBack} />
      <div className="community-waypoint-details-scroll">
        <header className="community-waypoint-details-identity">
          <span className="community-waypoint-details-identity-icon">
            <CommunityWaypointCategoryIcon category={waypoint.category} size={20} />
          </span>
          <div className="community-waypoint-details-identity-copy">
            <h3
              id="community-waypoint-detail-heading"
              ref={headingRef}
              tabIndex={-1}
              aria-label={waypoint.displayLabel}
            >
              {waypoint.building ?? categoryLabel}
            </h3>
            {waypoint.building && (
              <span className="community-waypoint-details-category">{categoryLabel}</span>
            )}
            {waypoint.floor !== undefined && (
              <span className="community-waypoint-details-floor">
                <MapPinIcon size={14} />
                {getCommunityWaypointFloorLabel(waypoint.floor)}
              </span>
            )}
          </div>
        </header>
        <div className="community-waypoint-details-fields">
          {waypoint.details && (
            <section className="community-waypoint-note" aria-label="Details">
              <h4 className="community-waypoint-note-title">
                <FileTextIcon size={14} />
                <span>Details</span>
              </h4>
              <p>{waypoint.details}</p>
            </section>
          )}
          {waypoint.accessibilityNote && (
            <section className="community-waypoint-note" aria-label="Accessibility">
              <h4 className="community-waypoint-note-title">
                <InfoIcon size={14} />
                <span>Accessibility</span>
              </h4>
              <p>{waypoint.accessibilityNote}</p>
            </section>
          )}
          <dl className="community-waypoint-metadata">
            <div>
              <dt>Source</dt>
              <dd>{waypoint.source}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd><time dateTime={waypoint.updatedAt}>{waypoint.updatedAt}</time></dd>
            </div>
          </dl>
        </div>
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

function CategoryRow({
  value,
  label,
  count,
  selected,
  onToggle,
  onSuggestWaypoint,
}: {
  readonly value: CommunityWaypointCategory
  readonly label: string
  readonly count: number
  readonly selected: boolean
  readonly onToggle: () => void
  readonly onSuggestWaypoint: CommunityWaypointPanelProps['onSuggestWaypoint']
}) {
  const suggestButtonRef = useRef<HTMLButtonElement>(null)
  const suggestionCategory = isActiveCommunityWaypointCategory(value) ? value : null

  return (
    <div className={'community-waypoint-category-row' + (selected ? ' is-selected' : '')}>
      <span className="community-waypoint-category-icon">
        <CommunityWaypointCategoryIcon category={value} size={19} />
      </span>
      <span className="community-waypoint-category-copy">
        <span className="community-waypoint-category-label">{label}</span>
        <span className="community-waypoint-category-count" aria-label={
          count + (count === 1 ? ' waypoint' : ' waypoints')
        }>
          {count}
        </span>
      </span>
      {suggestionCategory ? (
        <IconButton
          ref={suggestButtonRef}
          label={'Suggest ' + label + ' location'}
          title={'Suggest ' + label}
          icon={<PlusIcon />}
          onClick={() => {
            const trigger = suggestButtonRef.current
            if (trigger) onSuggestWaypoint(trigger, suggestionCategory)
          }}
          className="community-waypoint-suggest"
        />
      ) : (
        <span className="community-waypoint-suggest-placeholder" aria-hidden="true" />
      )}
      <button
        type="button"
        role="switch"
        className="community-waypoint-switch"
        aria-checked={selected}
        aria-label={'Show ' + label + ' on map'}
        onClick={onToggle}
      />
    </div>
  )
}

export function CommunityWaypointPanel({
  discovery,
  onSuggestCorrection,
  onSuggestWaypoint,
}: CommunityWaypointPanelProps) {
  const {
    status,
    categoryOptions,
    draftVisibleCategories,
    hasPendingVisibilityChanges,
    visibilitySaveStatus,
    selectedWaypoint,
    toggleCategory,
    saveVisibilitySelection,
    clearSelectedWaypoint,
    retry,
  } = discovery

  return (
    <div className="community-waypoint-panel">
      <div className="community-waypoint-browser navigation-panel-scroll-content" hidden={selectedWaypoint !== null}>
        <h3>Community Waypoints</h3>
        {status === 'loading' && <p className="community-waypoint-status" role="status">Loading approved Community Waypoints…</p>}
        {status === 'failed' && (
          <div className="community-waypoint-load-error">
            <p role="alert">Community Waypoints could not be loaded.</p>
            <Button label="Try again" onClick={retry} />
          </div>
        )}
        {status === 'ready' && (
          <>
            <fieldset className="community-waypoint-categories">
              <legend>Categories</legend>
              <div className="community-waypoint-category-list">
                {categoryOptions.map(({ value, label, count }) => (
                  <CategoryRow
                    key={value}
                    value={value}
                    label={label}
                    count={count}
                    selected={draftVisibleCategories.includes(value)}
                    onToggle={() => toggleCategory(value)}
                    onSuggestWaypoint={onSuggestWaypoint}
                  />
                ))}
              </div>
            </fieldset>
            <div className="community-waypoint-save">
              <p
                className="community-waypoint-save-status"
                role="status"
                aria-live="polite"
                data-error={visibilitySaveStatus?.includes('session only') || undefined}
              >
                {visibilitySaveStatus}
              </p>
              <Button
                label="Save"
                ariaLabel="Save Community Waypoint categories"
                variant="primary"
                disabled={!hasPendingVisibilityChanges}
                onClick={saveVisibilitySelection}
              />
            </div>
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
