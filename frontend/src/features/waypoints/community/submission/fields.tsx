import { useLayoutEffect, useMemo, useRef, type ComponentType } from 'react'
import { Autocomplete } from '@base-ui/react/autocomplete'
import { Input } from '@base-ui/react/input'
import {
  COMMUNITY_WAYPOINT_CATEGORIES,
  COMMUNITY_WAYPOINT_PRINTING_SERVICES,
  COMMUNITY_WAYPOINT_SUBMISSION_TEXT_LIMIT,
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
import { Chip } from '../../../../ui/chip'
import {
  AlertCircleIcon,
  BuildingIcon,
  SearchIcon,
  type IconProps,
} from '../../../../ui/icons'
import { CommunityWaypointCategoryIcon } from '../community-waypoint-category-icon'
import { COMMUNITY_WAYPOINT_PRINTING_SERVICE_ICONS } from '../community-waypoint-printing-service-icons'
import { COMMUNITY_WAYPOINT_VENDING_ITEM_ICONS } from '../community-waypoint-vending-item-icons'
import { COMMUNITY_WAYPOINT_VENDING_PREP_ICONS } from '../community-waypoint-vending-prep-icons'
import { OTHER_FLOOR, type SubmissionDraft, type SubmissionErrors } from './draft'
import { SubmissionField as FormField } from './field'
import { FloorPicker } from './floor-picker'

type SubmissionFieldValue = SubmissionDraft[keyof SubmissionDraft]

/* Draft values for the colour question. '' is unanswered, which is where a new suggestion and
   an unedited correction both start; 'unsure' is the deliberate "I don't know" answer. They
   mean the same thing to the server (null) but must not look the same on screen. */
type ColourAnswer = 'yes' | 'no' | 'unsure' | ''

const COLOUR_ANSWERS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Not sure' },
] as const satisfies readonly { readonly value: ColourAnswer; readonly label: string }[]

// HTML maxLength counts UTF-16 code units; allow one trimmed character at each edge.
const MAX_SUBMISSION_TEXT_CODE_UNITS = (COMMUNITY_WAYPOINT_SUBMISSION_TEXT_LIMIT + 1) * 2

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

function PillChoices<T extends string>({
  legend,
  options,
  icons,
  selected,
  onToggle,
}: {
  readonly legend: string
  readonly options: readonly { readonly value: T; readonly label: string }[]
  readonly icons?: Readonly<Record<string, ComponentType<IconProps> | undefined>>
  readonly selected: readonly T[]
  readonly onToggle: (value: T) => void
}) {
  return (
    <fieldset className="community-waypoint-details-group">
      <legend className="community-waypoint-details-legend">{legend}</legend>
      <div className="community-waypoint-details-chips">
        {options.map(({ value, label }) => {
          const Icon = icons?.[value]
          return (
            <Chip
              key={value}
              label={label}
              leading={Icon ? <Icon size={15} /> : undefined}
              /* Announces state through aria-pressed. Multi-select toggles each pill
                 independently, which is what a checkbox group does. */
              pressed={selected.includes(value)}
              onClick={() => onToggle(value)}
            />
          )
        })}
      </div>
    </fieldset>
  )
}

function toggleValue<T>(values: readonly T[], value: T): readonly T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]
}

function PriceInput({
  id,
  name,
  label,
  value,
  error,
  onChange,
}: {
  readonly id: string
  readonly name: 'grayscalePricePerPage' | 'colourPricePerPage'
  readonly label: string
  readonly value: string
  readonly error: string | undefined
  readonly onChange: (value: string) => void
}) {
  return (
    <div className="community-waypoint-details-price-field">
      <label htmlFor={id}>{label}</label>
      <div className="community-waypoint-details-price-input-group">
        <span className="community-waypoint-details-currency" aria-hidden="true">S$</span>
        {/* A text input with a decimal keypad, not type="number": the spinners eat the
            editable width in this narrow column, and the number type lets a scroll wheel
            change a submitted price by accident. Validation stays in the draft errors. */}
        <Input
          id={id}
          name={name}
          className="community-waypoint-details-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
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
      <div className="community-waypoint-submission-details community-waypoint-submission-details--printing">
        <PillChoices<CommunityWaypointPrintingService>
          legend="Services"
          options={COMMUNITY_WAYPOINT_PRINTING_SERVICES}
          icons={COMMUNITY_WAYPOINT_PRINTING_SERVICE_ICONS}
          selected={draft.services}

          onToggle={(value) => onFieldChange('services', toggleValue(draft.services, value))}
        />
        <PillChoices<ColourAnswer>
          legend="Colour printing"
          options={COLOUR_ANSWERS}
          /* Nothing is pressed until the user answers. 'unsure' is a real answer, so it
             presses; only the untouched state leaves the group blank. */
          selected={draft.colour === '' ? [] : [draft.colour]}
          onToggle={(value) => {
            /* The answer is recorded as given. Both '' and 'unsure' reach the server as
               null, but the form must not claim an answer the user never chose, nor lose
               the one they did. An explicit option is required here because a chosen radio
               cannot be deselected with the keyboard, and pressing a pill again to clear is
               a gesture nothing on screen advertises. */
            onFieldChange('colour', value)
            if (value !== 'yes') onFieldChange('colourPricePerPage', '')
          }}
        />
        <fieldset className="community-waypoint-details-group">
          <legend className="community-waypoint-details-legend">Price per page</legend>
          <div className={draft.colour === 'yes'
            ? 'community-waypoint-details-price-fields'
            : 'community-waypoint-details-price-fields community-waypoint-details-price-fields--single'}>
            <PriceInput
              id="community-submission-grayscale-price"
              name="grayscalePricePerPage"
              label="Black and white"
              value={draft.grayscalePricePerPage}
              error={errors.grayscalePricePerPage}
              onChange={(value) => onFieldChange('grayscalePricePerPage', value)}
            />
            {/* Mounted only when colour printing exists: a disabled field would repeat the
                word "Colour" a third time and give no reason for being unusable. */}
            {draft.colour === 'yes' && <PriceInput
              id="community-submission-colour-price"
              name="colourPricePerPage"
              label="Colour"
              value={draft.colourPricePerPage}
              error={errors.colourPricePerPage}
              onChange={(value) => onFieldChange('colourPricePerPage', value)}
            />}
          </div>
        </fieldset>
      </div>
    )
  }

  return (
    <div className="community-waypoint-submission-details community-waypoint-submission-details--vending">
      <PillChoices<CommunityWaypointVendingItem>
        legend="Items"
        options={COMMUNITY_WAYPOINT_VENDING_ITEMS}
        icons={COMMUNITY_WAYPOINT_VENDING_ITEM_ICONS}
        selected={draft.items}

        onToggle={(value) => onFieldChange('items', toggleValue(draft.items, value))}
      />
      <PillChoices<CommunityWaypointVendingPrep>
        legend="Prep"
        options={COMMUNITY_WAYPOINT_VENDING_PREP_OPTIONS}
        icons={COMMUNITY_WAYPOINT_VENDING_PREP_ICONS}
        selected={draft.prep}

        onToggle={(value) => onFieldChange('prep', toggleValue(draft.prep, value))}
      />
    </div>
  )
}

function MoreDetailsField({
  draft,
  errors,
  waypoint,
  validationAttempt,
  onFieldChange,
}: {
  readonly draft: SubmissionDraft
  readonly errors: SubmissionErrors
  readonly waypoint: CommunityWaypoint | null
  readonly validationAttempt: number
  readonly onFieldChange: (field: keyof SubmissionDraft, value: SubmissionFieldValue) => void
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const hasDetailsErrors = Boolean(
    errors.services || errors.colour || errors.grayscalePricePerPage ||
    errors.colourPricePerPage || errors.items || errors.prep,
  )

  /* Opens when a submit attempt reports details errors, so the field is visible before the
     form tries to focus it. Keyed on the attempt count, not on `errors`: watching the object
     made an unrelated field's error re-open a section the user had just closed, while a
     repeat submit of the same error never re-opened it. */
  useLayoutEffect(() => {
    if (hasDetailsErrors && detailsRef.current) detailsRef.current.open = true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hasDetailsErrors is read, not the trigger
  }, [validationAttempt])

  const category = draft.category || waypoint?.category
  if (category !== 'printing' && category !== 'vending_machine') return null
  const hasVerifiedDetails = waypoint !== null && (
    (waypoint.services?.length ?? 0) > 0 || waypoint.colour !== undefined ||
    waypoint.grayscalePriceCentsPerPage !== undefined || waypoint.colourPriceCentsPerPage !== undefined ||
    (waypoint.items?.length ?? 0) > 0 || (waypoint.prep?.length ?? 0) > 0
  )
  /* Counts the answers currently filled in, so a collapsed section still says it holds
     something. The disclosure's open state lives in the DOM, so this is not conditional
     on it: the count is also useful while the section is open with many options.
     "Not sure" is an answer, but it carries no fact to review, so it is not counted. */
  const filledCount = category === 'printing'
    ? draft.services.length + (draft.colour === 'yes' || draft.colour === 'no' ? 1 : 0) +
      (draft.grayscalePricePerPage.trim() === '' ? 0 : 1) +
      (draft.colour === 'yes' && draft.colourPricePerPage.trim() !== '' ? 1 : 0)
    : draft.items.length + draft.prep.length

  return (
    <details ref={detailsRef} className="community-waypoint-more-details" open={hasVerifiedDetails}>
      <summary>
        <span>More details</span>
        <span>{filledCount > 0 ? `· ${filledCount} added` : '(optional)'}</span>
      </summary>
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
  validationAttempt,
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
  readonly validationAttempt: number
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
        maxLength={MAX_SUBMISSION_TEXT_CODE_UNITS}
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
        validationAttempt={validationAttempt}
        onFieldChange={onFieldChange}
      />

      {!isCorrection && <TextField
        id="community-submission-explanation"
        name="explanation"
        label="Note for reviewers"
        value={draft.explanation}
        error={errors.explanation}
        maxLength={MAX_SUBMISSION_TEXT_CODE_UNITS}
        onChange={(value) => onFieldChange('explanation', value)}
      />}
    </>
  )
}
