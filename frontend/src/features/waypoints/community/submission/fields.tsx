import { useLayoutEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@astryxdesign/core/Button'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'
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
import {
  AlertCircleIcon,
  BuildingIcon,
  LocateIcon,
  SearchIcon,
  type IconProps,
} from '../../../../ui/icons'
import { CommunityWaypointCategoryIcon } from '../community-waypoint-category-icon'
import { COMMUNITY_WAYPOINT_PRINTING_SERVICE_ICONS } from '../community-waypoint-printing-service-icons'
import { COMMUNITY_WAYPOINT_VENDING_ITEM_ICONS } from '../community-waypoint-vending-item-icons'
import { COMMUNITY_WAYPOINT_VENDING_PREP_ICONS } from '../community-waypoint-vending-prep-icons'
import { OTHER_FLOOR, type SubmissionDraft, type SubmissionErrors } from './draft'
import { FloorPicker } from './floor-picker'

type SubmissionFieldValue = SubmissionDraft[keyof SubmissionDraft]

/* '' is unanswered; 'unsure' is a deliberate "I don't know" answer. Both become null in the
   submission, but the form must not make an unanswered question look answered. */
type AvailabilityAnswer = SubmissionDraft['colour']

const AVAILABILITY_ANSWERS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Not sure' },
] as const satisfies readonly { readonly value: AvailabilityAnswer; readonly label: string }[]

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
      <div className="community-waypoint-category-field">
        <RadioList
          label="Category"
          isLabelHidden
          isOptional
          value={draft.category}
          htmlName="category"
          status={errors.category ? { type: 'error' } : undefined}
          controlClassName="community-waypoint-category-options community-waypoint-category-options--correction"
          onChange={(value) => onFieldChange('category', value)}
        >
          <RadioListItem label="No change proposed" value="" className="community-waypoint-category-option" />
          {COMMUNITY_WAYPOINT_CATEGORIES.map(({ value, label }) => (
            <RadioListItem
              key={value}
              value={value}
              label={label}
              startContent={<CommunityWaypointCategoryIcon category={value} size={20} />}
              className="community-waypoint-category-option"
            />
          ))}
        </RadioList>
      </div>
    )
  }

  return (
    <fieldset className="community-waypoint-category-picker">
      <legend>Choose a category</legend>
      <RadioList
        label="Choose a category"
        isLabelHidden
        isRequired
        value={draft.category}
        htmlName="category"
        status={errors.category ? { type: 'error' } : undefined}
        controlClassName="community-waypoint-category-options"
        onChange={(value) => onFieldChange('category', value)}
      >
        {COMMUNITY_WAYPOINT_CATEGORIES.map(({ value, label }) => (
          <RadioListItem
            key={value}
            value={value}
            label={label}
            startContent={<CommunityWaypointCategoryIcon category={value} size={23} />}
            className="community-waypoint-category-option"
          />
        ))}
      </RadioList>
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
          className="community-waypoint-adjust-location-action"
          label="Adjust on map"
          icon={<LocateIcon size={15} />}
          onClick={(event) => onAdjustLocation(event.currentTarget)}
          aria-describedby={error ? 'community-submission-coordinate-error' : undefined}
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
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 256 })
  const inputRef = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    if (inputRef.current) inputRef.current.maxLength = (COMMUNITY_WAYPOINT_TEXT_LIMITS.building + 1) * 2
  }, [])
  const results = useMemo(
    () => buildingIndex && value.trim() ? searchBuildings(buildingIndex, value) : [],
    [buildingIndex, value],
  )
  const resultId = (index: number): string => `community-submission-building-result-${index}`
  useLayoutEffect(() => {
    if (!isOpen) return
    const updatePosition = (): void => {
      const input = inputRef.current
      if (!input) return
      const anchor = input.closest<HTMLElement>('.community-waypoint-building-input-group') ?? input
      const rect = anchor.getBoundingClientRect()
      const viewport = window.visualViewport
      const visibleBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight
      setPopupPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(80, Math.min(256, visibleBottom - rect.bottom - 12)),
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    window.visualViewport?.addEventListener('resize', updatePosition)
    window.visualViewport?.addEventListener('scroll', updatePosition)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      window.visualViewport?.removeEventListener('resize', updatePosition)
      window.visualViewport?.removeEventListener('scroll', updatePosition)
    }
  }, [isOpen])
  const choose = (entry: NonNullable<typeof results>[number]): void => {
    onChange(entry.name)
    setIsOpen(false)
    setActiveIndex(-1)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex((current) => (current + 1) % results.length)
    } else if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex((current) => current <= 0 ? results.length - 1 : current - 1)
    } else if (event.key === 'Enter' && isOpen && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault()
      choose(results[activeIndex])
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault()
      event.stopPropagation()
      setIsOpen(false)
      setActiveIndex(-1)
    }
  }

  return (
    <div className="community-waypoint-field community-waypoint-field--search">
      <div className="community-waypoint-building-combobox">
        <TextInput
          ref={inputRef}
          id="community-submission-building"
          label="Building or landmark"
          htmlName="building"
          type="text"
          value={value}
          placeholder="Search buildings or landmarks"
          hasClear
          autoComplete="off"
          inputMode="search"
          enterKeyHint="search"
          hasAutoCorrect={false}
          hasSpellCheck={false}
          startIcon={<SearchIcon />}
          status={error ? { type: 'error', message: error } : undefined}
          containerClassName="community-waypoint-building-astryx-field"
          controlClassName="community-waypoint-building-input-group"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="community-submission-building-listbox"
          aria-activedescendant={isOpen && activeIndex >= 0 ? resultId(activeIndex) : undefined}
          onFocus={() => setIsOpen(true)}
          onBlur={() => { setIsOpen(false); setActiveIndex(-1) }}
          onChange={(nextValue) => { onChange(nextValue); setIsOpen(true); setActiveIndex(-1) }}
          onKeyDown={handleKeyDown}
        />
        {isOpen && createPortal(<div
          id="community-submission-building-listbox"
          className="community-waypoint-building-popup"
          role="listbox"
          aria-label="Building suggestions"
          style={popupPosition}
        >
          {results.length > 0 ? results.map((entry, index) => {
            const secondary = describeBuildingEntry(entry)
            return <div
              key={entry.id}
              id={resultId(index)}
              className="community-waypoint-building-item"
              role="option"
              aria-selected={activeIndex === index}
              data-highlighted={activeIndex === index ? 'true' : undefined}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(entry)}
            >
              <BuildingIcon className="community-waypoint-building-item-icon" />
              <span className="community-waypoint-building-item-label">
                <strong>{entry.name}</strong>
                {secondary && <span>{secondary}</span>}
              </span>
            </div>
          }) : <div className="community-waypoint-building-empty">
            {value.trim()
              ? 'No matching buildings. You can keep your text.'
              : 'Search for a building or landmark.'}
          </div>}
        </div>, document.body)}
      </div>
    </div>
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
    <div className="community-waypoint-field community-waypoint-field--multiline">
      <span className="community-waypoint-field-label">{label}</span>
      <TextArea
        id={id}
        label={label}
        isLabelHidden
        htmlName={name}
        placeholder=" "
        rows={2}
        value={value}
        isRequired={required}
        htmlMaxLength={maxLength}
        status={error ? { type: 'error', message: error } : undefined}
        containerClassName="community-waypoint-astryx-field"
        controlClassName="community-waypoint-field-control community-waypoint-field-control--multiline"
        onChange={(nextValue) => onChange(nextValue)}
      />
    </div>
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
            <ToggleButton
              key={value}
              label={label}
              className="community-waypoint-choice"
              icon={Icon ? <Icon size={15} /> : undefined}
              isPressed={selected.includes(value)}
              onPressedChange={() => onToggle(value)}
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
  const inputRef = useRef<HTMLInputElement>(null)
  const [lastCommittedValue, setLastCommittedValue] = useState<number | null>(() => {
    const parsed = Number(value)
    return value.trim() !== '' && Number.isFinite(parsed) ? parsed : null
  })
  const [hasEntryError, setHasEntryError] = useState(false)
  const hasEntryErrorRef = useRef(false)
  const parsedValue = Number(value)
  const numberValue = value.trim() === ''
    ? null
    : Number.isFinite(parsedValue)
      ? parsedValue
      : lastCommittedValue

  return (
    <div className="community-waypoint-details-price-field">
      <span className="community-waypoint-details-price-label">{label}</span>
      <div className="community-waypoint-details-price-input-group">
        <span className="community-waypoint-details-currency" aria-hidden="true">S$</span>
        <NumberInput
          ref={inputRef}
          id={id}
          label={`${label} price per page in Singapore dollars`}
          isLabelHidden
          htmlName={name}
          value={numberValue}
          min={0}
          step={0.01}
          hasClear
          hasNumberSteppers={false}
          isWheelEnabled={false}
          formatValue={(nextValue) => nextValue.toFixed(2)}
          statusVariant="tooltip"
          status={error
            ? { type: 'error', message: error }
            : hasEntryError
              ? { type: 'error', message: 'Enter a price with up to 2 decimal places.' }
              : undefined}
          containerClassName="community-waypoint-details-price-astryx-field"
          controlClassName="community-waypoint-details-input"
          onChange={(nextValue) => {
            setLastCommittedValue(nextValue)
            onChange(nextValue === null ? '' : String(nextValue))
          }}
          onEntryErrorChange={(entryError) => {
            const hadEntryError = hasEntryErrorRef.current
            hasEntryErrorRef.current = entryError !== null
            setHasEntryError(entryError !== null)
            if (entryError) {
              const currentValue = Number(value)
              setLastCommittedValue(value.trim() !== '' && Number.isFinite(currentValue) ? currentValue : null)
              onChange(entryError.text)
            } else if (hadEntryError && inputRef.current) {
              onChange(inputRef.current.value)
            }
          }}
        />
      </div>
    </div>
  )
}

function CategoryDetailsFields({
  category,
  draft,
  errors,
  onFieldChange,
}: {
  readonly category: 'printing' | 'vending_machine' | 'toilet'
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
        <PillChoices<AvailabilityAnswer>
          legend="Colour printing"
          options={AVAILABILITY_ANSWERS}
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
          {draft.colour !== 'yes' && <p className="community-waypoint-details-price-hint">
            Select Yes above to add a colour price.
          </p>}
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

  if (category === 'toilet') {
    return (
      <div className="community-waypoint-submission-details community-waypoint-submission-details--toilet">
        <PillChoices<AvailabilityAnswer>
          legend="Bidet available"
          options={AVAILABILITY_ANSWERS}
          selected={draft.bidet === '' ? [] : [draft.bidet]}
          onToggle={(value) => onFieldChange('bidet', value)}
        />
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
  isOpen,
  onOpenChange,
  onFieldChange,
}: {
  readonly draft: SubmissionDraft
  readonly errors: SubmissionErrors
  readonly waypoint: CommunityWaypoint | null
  readonly isOpen: boolean
  readonly onOpenChange: (isOpen: boolean) => void
  readonly onFieldChange: (field: keyof SubmissionDraft, value: SubmissionFieldValue) => void
}) {
  const category = draft.category || waypoint?.category
  if (category !== 'printing' && category !== 'vending_machine' && category !== 'toilet') return null
  /* Counts the answers currently filled in, so a collapsed section still says it holds
     something. The disclosure's open state lives in the DOM, so this is not conditional
     on it: the count is also useful while the section is open with many options.
     "Not sure" is an answer, but it carries no fact to review, so it is not counted. */
  const filledCount = category === 'printing'
    ? draft.services.length + (draft.colour === 'yes' || draft.colour === 'no' ? 1 : 0) +
      (draft.grayscalePricePerPage.trim() === '' ? 0 : 1) +
      (draft.colour === 'yes' && draft.colourPricePerPage.trim() !== '' ? 1 : 0)
    : category === 'toilet'
      ? draft.bidet === 'yes' || draft.bidet === 'no' ? 1 : 0
      : draft.items.length + draft.prep.length

  return (
    <Collapsible
      className="community-waypoint-more-details"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      trigger={(
        <>
        <span>More details</span>
        <span className="community-waypoint-more-details-count">
          {filledCount > 0 ? `· ${filledCount} added` : '(optional)'}
        </span>
        </>
      )}
    >
      <CategoryDetailsFields
        category={category}
        draft={draft}
        errors={errors}
        onFieldChange={onFieldChange}
      />
    </Collapsible>
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
  isDetailsOpen,
  onDetailsOpenChange,
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
  readonly isDetailsOpen: boolean
  readonly onDetailsOpenChange: (isOpen: boolean) => void
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
        isOpen={isDetailsOpen}
        onOpenChange={onDetailsOpenChange}
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
