import { useMemo, type ComponentType } from 'react'
import { Autocomplete } from '@base-ui/react/autocomplete'
import { Checkbox } from '@base-ui/react/checkbox'
import { CheckboxGroup } from '@base-ui/react/checkbox-group'
import { Input } from '@base-ui/react/input'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import {
  COMMUNITY_WAYPOINT_CATEGORIES,
  COMMUNITY_WAYPOINT_PRINTING_SERVICES,
  COMMUNITY_WAYPOINT_TEXT_LIMITS,
  COMMUNITY_WAYPOINT_VENDING_ITEMS,
  COMMUNITY_WAYPOINT_VENDING_PREP_OPTIONS,
  type CommunityWaypoint,
  type CommunityWaypointPrintingService,
  type CommunityWaypointVendingItem,
  type CommunityWaypointVendingPrep,
} from '@nusgo/shared'
import type { WaypointCoordinate } from '@nusgo/shared/waypoints/waypoint'
import type { BuildingIndex } from '../../../../domain/venue/building-index'
import { describeBuildingEntry, searchBuildings } from '../../../../domain/venue/building-index'
import { Button } from '../../../../ui/button'
import {
  AlertCircleIcon,
  BuildingIcon,
  CheckIcon,
  SearchIcon,
  type IconProps,
} from '../../../../ui/icons'
import { CommunityWaypointCategoryIcon } from '../community-waypoint-category-icon'
import { COMMUNITY_WAYPOINT_VENDING_ITEM_ICONS } from '../community-waypoint-vending-item-icons'
import { OTHER_FLOOR, type SubmissionDraft, type SubmissionErrors } from './draft'
import { SubmissionField as FormField } from './field'
import { FloorPicker } from './floor-picker'

type SubmissionFieldValue = SubmissionDraft[keyof SubmissionDraft]

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

function CheckboxOptions<T extends string>({
  name,
  legend,
  options,
  icons,
  selected,
  onChange,
}: {
  readonly name: string
  readonly legend: string
  readonly options: readonly { readonly value: T; readonly label: string }[]
  readonly icons?: Readonly<Record<string, ComponentType<IconProps> | undefined>>
  readonly selected: readonly T[]
  readonly onChange: (selected: readonly T[]) => void
}) {
  const labelId = `community-submission-${name}-details-label`

  return (
    <div className="community-waypoint-details-row community-waypoint-details-row--options">
      <span id={labelId} className="community-waypoint-details-row-label">{legend}</span>
      <CheckboxGroup
        aria-labelledby={labelId}
        value={[...selected]}
        className="community-waypoint-details-control-group community-waypoint-details-option-list"
        onValueChange={(values) => onChange(
          options.filter(({ value }) => values.includes(value)).map(({ value }) => value),
        )}
      >
        {options.map(({ value, label }) => {
          const Icon = icons?.[value]
          return (
            <label
              key={value}
              className={`community-waypoint-details-option${Icon ? ' community-waypoint-details-option--with-icon' : ''}`}
            >
              <Checkbox.Root name={name} value={value} className="community-waypoint-details-checkbox">
                <Checkbox.Indicator className="community-waypoint-details-checkbox-indicator">
                  <CheckIcon size={12} />
                </Checkbox.Indicator>
              </Checkbox.Root>
              {Icon && <Icon className="community-waypoint-details-option-icon" size={16} />}
              <span>{label}</span>
            </label>
          )
        })}
      </CheckboxGroup>
    </div>
  )
}

function PriceInput({
  id,
  name,
  label,
  value,
  error,
  disabled = false,
  onChange,
}: {
  readonly id: string
  readonly name: 'grayscalePricePerPage' | 'colourPricePerPage'
  readonly label: string
  readonly value: string
  readonly error: string | undefined
  readonly disabled?: boolean
  readonly onChange: (value: string) => void
}) {
  return (
    <div className="community-waypoint-details-price-field">
      <label htmlFor={id}>{label}</label>
      <div className="community-waypoint-details-price-input-group">
        <span className="community-waypoint-details-currency" aria-hidden="true">S$</span>
        <Input
          id={id}
          name={name}
          className="community-waypoint-details-input"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          aria-label={`${label} price per page in Singapore dollars`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onValueChange={onChange}
        />
      </div>
      {error && <p id={`${id}-error`} className="community-waypoint-field-error">
        <AlertCircleIcon className="community-waypoint-field-error-icon" size={14} />
        <span>{error}</span>
      </p>}
    </div>
  )
}

function CategoryDetailsFields({
  category,
  draft,
  errors,
  onFieldChange,
}: {
  readonly category: 'printing' | 'vending_machine'
  readonly draft: SubmissionDraft
  readonly errors: SubmissionErrors
  readonly onFieldChange: (field: keyof SubmissionDraft, value: SubmissionFieldValue) => void
}) {
  if (category === 'printing') {
    return (
      <div className="community-waypoint-details-fields community-waypoint-details-fields--printing">
        <CheckboxOptions<CommunityWaypointPrintingService>
          name="services"
          legend="Services"
          options={COMMUNITY_WAYPOINT_PRINTING_SERVICES}
          selected={draft.services}
          onChange={(value) => onFieldChange('services', value)}
        />
        <div className="community-waypoint-details-row">
          <span id="community-submission-colour-label" className="community-waypoint-details-row-label">
            Colour
          </span>
          <RadioGroup
            name="colour"
            value={draft.colour}
            onValueChange={(value) => {
              if (value !== 'yes' && value !== 'no') return
              onFieldChange('colour', value)
              if (value !== 'yes') onFieldChange('colourPricePerPage', '')
            }}
            className="community-waypoint-details-control-group"
            aria-labelledby="community-submission-colour-label"
          >
            <div className="community-waypoint-details-option-list">
              {(['yes', 'no'] as const).map((value) => (
                <label key={value} className="community-waypoint-details-option">
                  <Radio.Root value={value} className="community-waypoint-details-radio">
                    <Radio.Indicator className="community-waypoint-details-radio-indicator" />
                  </Radio.Root>
                  <span>{value === 'yes' ? 'Yes' : 'No'}</span>
                </label>
              ))}
              {draft.colour !== '' && (
                <button
                  type="button"
                  className="community-waypoint-details-clear"
                  aria-label="Clear Colour"
                  onClick={() => {
                    onFieldChange('colour', '')
                    onFieldChange('colourPricePerPage', '')
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </RadioGroup>
        </div>
        <div className="community-waypoint-details-row community-waypoint-details-row--price">
          <span id="community-submission-price-label" className="community-waypoint-details-row-label">
            Price per page
          </span>
          <fieldset
            className="community-waypoint-details-price-fields"
            aria-labelledby="community-submission-price-label"
          >
            <legend className="visually-hidden">Price per page</legend>
            <PriceInput
              id="community-submission-grayscale-price"
              name="grayscalePricePerPage"
              label="Grayscale"
              value={draft.grayscalePricePerPage}
              error={errors.grayscalePricePerPage}
              onChange={(value) => onFieldChange('grayscalePricePerPage', value)}
            />
            <PriceInput
              id="community-submission-colour-price"
              name="colourPricePerPage"
              label="Colour"
              value={draft.colourPricePerPage}
              error={errors.colourPricePerPage}
              disabled={draft.colour !== 'yes'}
              onChange={(value) => onFieldChange('colourPricePerPage', value)}
            />
          </fieldset>
        </div>
      </div>
    )
  }

  return (
    <div className="community-waypoint-details-fields community-waypoint-details-fields--vending">
      <CheckboxOptions<CommunityWaypointVendingItem>
        name="items"
        legend="Items"
        options={COMMUNITY_WAYPOINT_VENDING_ITEMS}
        icons={COMMUNITY_WAYPOINT_VENDING_ITEM_ICONS}
        selected={draft.items}
        onChange={(value) => onFieldChange('items', value)}
      />
      <CheckboxOptions<CommunityWaypointVendingPrep>
        name="prep"
        legend="Prep"
        options={COMMUNITY_WAYPOINT_VENDING_PREP_OPTIONS}
        selected={draft.prep}
        onChange={(value) => onFieldChange('prep', value)}
      />
    </div>
  )
}

function MoreDetailsField({
  draft,
  errors,
  waypoint,
  onFieldChange,
}: {
  readonly draft: SubmissionDraft
  readonly errors: SubmissionErrors
  readonly waypoint: CommunityWaypoint | null
  readonly onFieldChange: (field: keyof SubmissionDraft, value: SubmissionFieldValue) => void
}) {
  const category = draft.category || waypoint?.category
  if (category !== 'printing' && category !== 'vending_machine') return null
  const hasVerifiedDetails = waypoint !== null && (
    (waypoint.services?.length ?? 0) > 0 || waypoint.colour !== undefined ||
    waypoint.grayscalePriceCentsPerPage !== undefined || waypoint.colourPriceCentsPerPage !== undefined ||
    (waypoint.items?.length ?? 0) > 0 || (waypoint.prep?.length ?? 0) > 0
  )

  return (
    <details className="community-waypoint-more-details" open={hasVerifiedDetails}>
      <summary><span>More details</span><span>(optional)</span></summary>
      <CategoryDetailsFields
        category={category}
        draft={draft}
        errors={errors}
        onFieldChange={onFieldChange}
      />
    </details>
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
  readonly onFieldChange: (field: keyof SubmissionDraft, value: SubmissionFieldValue) => void
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

      <MoreDetailsField
        draft={draft}
        errors={errors}
        waypoint={waypoint}
        onFieldChange={onFieldChange}
      />

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
