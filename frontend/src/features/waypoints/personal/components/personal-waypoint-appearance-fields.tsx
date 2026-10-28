import type { IconProps } from '../../../../ui/icons'
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
  const markerColor = draft.markerColor ?? DEFAULT_PERSONAL_WAYPOINT_MARKER_COLOR
  const markerIcon = draft.markerIcon ?? DEFAULT_PERSONAL_WAYPOINT_MARKER_ICON
  const MarkerIcon = markerIcons[markerIcon]

  return <section className="personal-waypoint-appearance" aria-labelledby="personal-waypoint-appearance-heading">
    <div className="personal-waypoint-appearance-heading">
      <div>
        <h3 id="personal-waypoint-appearance-heading">Map marker</h3>
      </div>
      <span
        className="personal-waypoint-marker-preview"
        data-color={markerColor}
        aria-hidden="true"
      >
        <MarkerIcon className="personal-waypoint-marker-preview-icon" size={14} />
      </span>
    </div>

    <fieldset className="personal-waypoint-choice-group">
      <legend>Color</legend>
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
              onChange={() => onChange({ markerIcon: value })}
            />
            <Icon className="personal-waypoint-choice-icon" size={17} />
            <span>{label}</span>
          </label>
        })}
      </div>
    </fieldset>
  </section>
}
