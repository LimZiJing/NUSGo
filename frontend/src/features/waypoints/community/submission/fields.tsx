import { useMemo } from 'react'
import { Autocomplete } from '@base-ui/react/autocomplete'
import {
  COMMUNITY_WAYPOINT_CATEGORIES,
  COMMUNITY_WAYPOINT_TEXT_LIMITS,
  type CommunityWaypoint,
} from '@nusgo/shared'
import type { WaypointCoordinate } from '@nusgo/shared/waypoints/waypoint'
import type { BuildingIndex } from '../../../../domain/venue/building-index'
import { describeBuildingEntry, searchBuildings } from '../../../../domain/venue/building-index'
import { Button } from '../../../../ui/button'
import {
  AlertCircleIcon,
  BuildingIcon,
  SearchIcon,
} from '../../../../ui/icons'
import { CommunityWaypointCategoryIcon } from '../community-waypoint-category-icon'
import { OTHER_FLOOR, type SubmissionDraft, type SubmissionErrors } from './draft'
import { SubmissionField as FormField } from './field'
import { FloorPicker } from './floor-picker'

function coordinateValue(value: number, positiveDirection: string, negativeDirection: string): string {
  return `${Math.abs(value).toFixed(6)}° ${value < 0 ? negativeDirection : positiveDirection}`
}

function CategoryField({
  draft,
  errors,
  isCorrection,
  onFieldChange,
}: {
  readonly draft: SubmissionDraft
  readonly errors: SubmissionErrors
  readonly isCorrection: boolean
  readonly onFieldChange: (field: keyof SubmissionDraft, value: string) => void
}) {
  if (isCorrection) {
    return (
      <FormField
        id="community-submission-category"
        name="category"
        label="Category"
        error={errors.category}
        layout="select"
      >
        <select
          id="community-submission-category"
          name="category"
          className="community-waypoint-field-control"
          value={draft.category}
          aria-invalid={Boolean(errors.category)}
          aria-describedby={errors.category ? 'community-submission-category-error' : undefined}
          onChange={(event) => onFieldChange('category', event.target.value)}
        >
          <option value="">No change proposed</option>
          {COMMUNITY_WAYPOINT_CATEGORIES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </FormField>
    )
  }

  return (
    <fieldset
      className="community-waypoint-category-picker"
      aria-invalid={Boolean(errors.category)}
      aria-describedby={errors.category ? 'community-submission-category-error' : undefined}
    >
      <legend>Choose a category</legend>
      <div className="community-waypoint-category-options">
        {COMMUNITY_WAYPOINT_CATEGORIES.map(({ value, label }) => (
          <label key={value} className="community-waypoint-category-option">
            <input
              type="radio"
              name="category"
              value={value}
              checked={draft.category === value}
              required
              onChange={(event) => onFieldChange('category', event.target.value)}
            />
            <span className="community-waypoint-category-card">
              <CommunityWaypointCategoryIcon category={value} size={23} />
              <span>{label}</span>
            </span>
          </label>
        ))}
      </div>
      {errors.category && <p id="community-submission-category-error" className="community-waypoint-field-error">
        <AlertCircleIcon className="community-waypoint-field-error-icon" size={14} />
        <span>{errors.category}</span>
      </p>}
    </fieldset>
  )
}

function LocationField({
  coordinate,
  locationStatus,
  locationAccuracy,
  error,
  onAdjustLocation,
}: {
  readonly coordinate: WaypointCoordinate
  readonly locationStatus: 'locating' | 'ready' | 'required'
  readonly locationAccuracy: number | null
  readonly error: string | undefined
  readonly onAdjustLocation: (trigger: HTMLButtonElement) => void
}) {
  return (
    <div
      className="community-waypoint-submission-coordinate"
      role="group"
      aria-labelledby="community-submission-coordinate-label"
    >
      <div className="community-waypoint-submission-coordinate-heading">
        <strong id="community-submission-coordinate-label">Location</strong>
        {locationStatus === 'ready' && locationAccuracy !== null && Number.isFinite(locationAccuracy) && (
          <span className="community-waypoint-location-status">Using current location</span>
        )}
      </div>
      <div className="community-waypoint-submission-coordinate-content">
        {locationStatus === 'ready' ? (
          <dl className="community-waypoint-submission-coordinate-values">
            <div>
              <dt>Latitude</dt>
              <dd>{coordinateValue(coordinate.latitude, 'N', 'S')}</dd>
            </div>
            <div>
              <dt>Longitude</dt>
              <dd>{coordinateValue(coordinate.longitude, 'E', 'W')}</dd>
            </div>
          </dl>
        ) : (
          <p className="community-waypoint-location-message">
            {locationStatus === 'locating'
              ? 'Getting your current location…'
              : 'Could not get your location. Set the waypoint location on the map before sending.'}
          </p>
        )}
        <Button
          label="Adjust on map"
          onClick={(event) => onAdjustLocation(event.currentTarget)}
          ariaDescribedBy={error ? 'community-submission-coordinate-error' : undefined}
        />
      </div>
      {error && <p id="community-submission-coordinate-error" className="community-waypoint-field-error">
        <AlertCircleIcon className="community-waypoint-field-error-icon" size={14} />
        <span>{error}</span>
      </p>}
    </div>
  )
}

function BuildingField({
  buildingIndex,
  value,
  error,
  onChange,
}: {
  readonly buildingIndex: BuildingIndex | null
  readonly value: string
  readonly error: string | undefined
  readonly onChange: (value: string) => void
}) {
  const results = useMemo(
    () => buildingIndex && value.trim() ? searchBuildings(buildingIndex, value) : [],
    [buildingIndex, value],
  )

  return (
    <FormField
      id="community-submission-building"
      name="building"
      label="Building or landmark"
      error={error}
      layout="search"
    >
      <Autocomplete.Root
        items={buildingIndex?.entries ?? []}
        filteredItems={results}
        value={value}
        itemToStringValue={(entry) => entry.name}
        openOnInputClick
        onValueChange={onChange}
      >
        <Autocomplete.InputGroup className="community-waypoint-building-input-group">
          <SearchIcon className="community-waypoint-building-search-icon" />
          <Autocomplete.Input
            id="community-submission-building"
            name="building"
            className="community-waypoint-field-control community-waypoint-building-input"
            placeholder=" "
            maxLength={(COMMUNITY_WAYPOINT_TEXT_LIMITS.building + 1) * 2}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'community-submission-building-error' : undefined}
            autoComplete="off"
          />
        </Autocomplete.InputGroup>
        <Autocomplete.Portal>
          <Autocomplete.Positioner className="community-waypoint-building-positioner" sideOffset={4}>
            <Autocomplete.Popup className="community-waypoint-building-popup">
              <Autocomplete.Empty>
                <div className="community-waypoint-building-empty">
                  {value.trim()
                    ? 'No matching buildings. You can keep your text.'
                    : 'Search for a building or landmark.'}
                </div>
              </Autocomplete.Empty>
              <Autocomplete.List className="community-waypoint-building-list">
                {(entry) => {
                  const secondary = describeBuildingEntry(entry)
                  return (
                    <Autocomplete.Item
                      key={entry.id}
                      value={entry}
                      className="community-waypoint-building-item"
                    >
                      <BuildingIcon className="community-waypoint-building-item-icon" />
                      <span className="community-waypoint-building-item-label">
                        <strong>{entry.name}</strong>
                        {secondary && <span>{secondary}</span>}
                      </span>
                    </Autocomplete.Item>
                  )
                }}
              </Autocomplete.List>
            </Autocomplete.Popup>
          </Autocomplete.Positioner>
        </Autocomplete.Portal>
      </Autocomplete.Root>
    </FormField>
  )
}

function TextField({
  id,
  name,
  label,
  value,
  error,
  required = false,
  maxLength,
  onChange,
}: {
  readonly id: string
  readonly name: 'explanation' | 'requestedChange'
  readonly label: string
  readonly value: string
  readonly error: string | undefined
  readonly required?: boolean
  readonly maxLength: number
  readonly onChange: (value: string) => void
}) {
  return (
    <FormField id={id} name={name} label={label} error={error} layout="multiline">
      <textarea
        id={id}
        name={name}
        className="community-waypoint-field-control community-waypoint-field-control--multiline"
        placeholder=" "
        rows={2}
        value={value}
        required={required}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  )
}

export function CommunityWaypointSubmissionFields({
  draft,
  errors,
  waypoint,
  coordinate,
  locationStatus,
  locationAccuracy,
  buildingIndex,
  observedFloors,
  onFieldChange,
  onAdjustLocation,
}: {
  readonly draft: SubmissionDraft
  readonly errors: SubmissionErrors
  readonly waypoint: CommunityWaypoint | null
  readonly coordinate: WaypointCoordinate
  readonly locationStatus: 'locating' | 'ready' | 'required'
  readonly locationAccuracy: number | null
  readonly buildingIndex: BuildingIndex | null
  readonly observedFloors: readonly number[] | undefined
  readonly onFieldChange: (field: keyof SubmissionDraft, value: string) => void
  readonly onAdjustLocation: (trigger: HTMLButtonElement) => void
}) {
  const isCorrection = waypoint !== null

  return (
    <>
      {isCorrection && <p className="community-waypoint-submission-target">
        <span>Correction for</span>
        <strong>{waypoint.displayLabel}</strong>
      </p>}

      <CategoryField draft={draft} errors={errors} isCorrection={isCorrection} onFieldChange={onFieldChange} />
      <LocationField
        coordinate={coordinate}
        locationStatus={locationStatus}
        locationAccuracy={locationAccuracy}
        error={errors.coordinate}
        onAdjustLocation={onAdjustLocation}
      />

      {isCorrection && <TextField
        id="community-submission-correction"
        name="requestedChange"
        label="What needs correcting?"
        value={draft.requestedChange}
        error={errors.requestedChange}
        required
        maxLength={2_002}
        onChange={(value) => onFieldChange('requestedChange', value)}
      />}

      <section className="community-waypoint-extra-fields" aria-labelledby="community-submission-building-floor-heading">
        <h3 id="community-submission-building-floor-heading" className="community-waypoint-extra-fields-title">
          Building and floor <span>(optional)</span>
        </h3>
        <div className="community-waypoint-extra-fields-content">
          <BuildingField
            buildingIndex={buildingIndex}
            value={draft.building}
            error={errors.building}
            onChange={(value) => onFieldChange('building', value)}
          />
          <FloorPicker
            floor={draft.floor}
            otherFloor={draft.otherFloor}
            observedFloors={observedFloors}
            error={errors.floor}
            onFloorChange={(value) => onFieldChange('floor', value)}
            onOtherFloorChange={(value) => {
              onFieldChange('floor', OTHER_FLOOR)
              onFieldChange('otherFloor', value)
            }}
          />
        </div>
      </section>

      {!isCorrection && <TextField
        id="community-submission-explanation"
        name="explanation"
        label="Note for reviewers"
        value={draft.explanation}
        error={errors.explanation}
        maxLength={2_002}
        onChange={(value) => onFieldChange('explanation', value)}
      />}
    </>
  )
}
