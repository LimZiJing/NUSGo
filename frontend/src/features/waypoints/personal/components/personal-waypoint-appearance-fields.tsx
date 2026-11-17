import { useState } from 'react'
import type { IconProps } from '../../../../ui/icons'
import { Button } from '../../../../ui/button'
import type { PersonalWaypointDraft } from '../../../../domain/waypoints/personal/create-personal-waypoint'
import {
  DEFAULT_PERSONAL_WAYPOINT_MARKER_COLOR,
  DEFAULT_PERSONAL_WAYPOINT_MARKER_ICON,
  PERSONAL_WAYPOINT_MARKER_COLOR_OPTIONS,
  PERSONAL_WAYPOINT_MARKER_ICON_OPTIONS,
} from '../../../../domain/waypoints/personal/personal-waypoint'
import {
  ArmchairIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleDotIcon,
  CoffeeIcon,
  FavoriteIcon,
  TreePineIcon,
} from '../../../../ui/icons'

function FavoriteWaypointIcon(props: IconProps) {
  return <FavoriteIcon filled={false} {...props} />
}

const markerIcons = {
  dot: CircleDotIcon,
  rest: ArmchairIcon,
  food: CoffeeIcon,
  nature: TreePineIcon,
  favorite: FavoriteWaypointIcon,
} as const

export function PersonalWaypointAppearanceFields({
  draft,
  onChange,
}: {
  readonly draft: PersonalWaypointDraft
  readonly onChange: (changes: Partial<PersonalWaypointDraft>) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const markerColor = draft.markerColor ?? DEFAULT_PERSONAL_WAYPOINT_MARKER_COLOR
  const markerIcon = draft.markerIcon ?? DEFAULT_PERSONAL_WAYPOINT_MARKER_ICON
  const markerColorLabel = PERSONAL_WAYPOINT_MARKER_COLOR_OPTIONS.find(({ value }) => value === markerColor)?.label ?? markerColor
  const markerIconLabel = PERSONAL_WAYPOINT_MARKER_ICON_OPTIONS.find(({ value }) => value === markerIcon)?.label ?? markerIcon
  const MarkerIcon = markerIcons[markerIcon]

  return <section className="personal-waypoint-appearance" aria-labelledby="personal-waypoint-appearance-label">
    <Button
      className="personal-waypoint-appearance-trigger"
      type="button"
      ariaLabel={`Marker style, ${markerColorLabel} marker, ${markerIconLabel} icon`}
      expanded={isExpanded}
      controls="personal-waypoint-appearance-options"
      onClick={() => setIsExpanded((expanded) => !expanded)}
    >
      <span id="personal-waypoint-appearance-label" className="personal-waypoint-appearance-title">Marker style</span>
      <span
        className="personal-waypoint-marker-preview"
        data-color={markerColor}
        aria-hidden="true"
      >
        <MarkerIcon className="personal-waypoint-marker-preview-icon" size={14} />
      </span>
      <ChevronDownIcon className="personal-waypoint-appearance-chevron" size={18} aria-hidden />
    </Button>

    <div id="personal-waypoint-appearance-options" className="personal-waypoint-appearance-options" hidden={!isExpanded}>
      <fieldset className="personal-waypoint-choice-group">
        <legend>Colour</legend>
        <div className="personal-waypoint-color-options">
          {PERSONAL_WAYPOINT_MARKER_COLOR_OPTIONS.map(({ value, label }) => (
            <label className="personal-waypoint-color-option" key={value}>
              <input
                type="radio"
                name="personal-waypoint-marker-color"
                value={value}
                checked={markerColor === value}
                aria-label={label}
                onChange={() => onChange({ markerColor: value })}
              />
              <span className="personal-waypoint-color-swatch" data-color={value} aria-hidden="true">
                <CheckIcon className="personal-waypoint-color-check" size={18} />
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="personal-waypoint-choice-group">
        <legend>Icon</legend>
        <div className="personal-waypoint-icon-options">
          {PERSONAL_WAYPOINT_MARKER_ICON_OPTIONS.map(({ value, label }) => {
            const Icon = markerIcons[value]
            return <label className="personal-waypoint-icon-option" key={value}>
              <input
                type="radio"
                name="personal-waypoint-marker-icon"
                value={value}
                checked={markerIcon === value}
                aria-label={label}
                onChange={() => onChange({ markerIcon: value })}
              />
              <Icon className="personal-waypoint-choice-icon" size={17} />
            </label>
          })}
        </div>
      </fieldset>
    </div>
  </section>
}
