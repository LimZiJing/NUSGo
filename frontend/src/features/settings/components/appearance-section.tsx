import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl'
import type { ThemePreference } from '../../../ui/theme'
import { OTHER_THEMES } from '../../../ui/themes/catalog'
import type { MinuteFormat } from '../../../domain/trip/minute-format'
import { MonitorIcon, MoonIcon, SunIcon } from '../../../ui/icons'
import { Select } from '../../../ui/select'

interface AppearanceSectionProps {
  readonly preference: ThemePreference
  readonly onChange: (preference: ThemePreference) => void
  readonly minuteFormat: MinuteFormat
  readonly onMinuteFormatChange: (format: MinuteFormat) => void
}

const THEME_CHOICES = [
  { value: 'system', label: 'System', Icon: MonitorIcon },
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
] as const

const OTHER_THEME_CHOICES = OTHER_THEMES

const OTHER_THEME_OPTIONS = OTHER_THEME_CHOICES.map(({ id, label }) => ({
  value: id,
  label,
  leading: <span className="settings-theme-swatch" data-theme-choice={id} />,
}))

const MINUTE_FORMAT_CHOICES = [
  { value: 'm', label: '12m', accessibleLabel: '12 minutes shown as 12m' },
  { value: 'prime', label: '12′', accessibleLabel: '12 minutes shown as 12′' },
  { value: 'min', label: '12 min', accessibleLabel: '12 minutes shown as 12 min' },
] as const

export function AppearanceSection({
  preference,
  onChange,
  minuteFormat,
  onMinuteFormatChange,
}: AppearanceSectionProps) {
  const selectedOtherTheme = OTHER_THEME_CHOICES.find(({ id }) => preference === id)

  function handleBaseThemeChange(value: string) {
    if (THEME_CHOICES.some((choice) => choice.value === value)) {
      onChange(value as ThemePreference)
    }
  }

  function handleOtherThemeChange(value: string) {
    const choice = OTHER_THEME_CHOICES.find((theme) => theme.id === value)
    if (choice) onChange(choice.id)
  }

  function handleMinuteFormatChange(value: string) {
    if (MINUTE_FORMAT_CHOICES.some((choice) => choice.value === value)) {
      onMinuteFormatChange(value as MinuteFormat)
    }
  }

  return (
    <div className="settings-appearance-card">
      <div className="settings-choice-group">
        <div className="settings-choice-heading" id="settings-appearance-heading">
          Theme
        </div>
        <SegmentedControl
          className="settings-choice-options"
          value={THEME_CHOICES.some((choice) => choice.value === preference) ? preference : ''}
          onChange={handleBaseThemeChange}
          label="Theme"
          size="sm"
          layout="fill"
        >
          {THEME_CHOICES.map(({ value, label, Icon }) => (
            <SegmentedControlItem
              key={value}
              value={value}
              label={label}
              icon={<Icon size={16} />}
            />
          ))}
        </SegmentedControl>
      </div>
      <div className="settings-choice-group">
        <div className="settings-choice-heading">Other themes</div>
        <Select
          label="Other themes"
          value={selectedOtherTheme?.id ?? ''}
          placeholder="Choose"
          options={OTHER_THEME_OPTIONS}
          onChange={handleOtherThemeChange}
          size="lg"
          checkPosition="end"
          hideLabel
          className="settings-theme-select"
        />
      </div>
      <div className="settings-choice-group">
        <div className="settings-choice-heading" id="settings-minute-format-heading">
          Minute format
        </div>
        <SegmentedControl
          className="settings-choice-options"
          value={minuteFormat}
          onChange={handleMinuteFormatChange}
          label="Minute format"
          size="sm"
          layout="fill"
        >
          {MINUTE_FORMAT_CHOICES.map(({ value, label, accessibleLabel }) => (
            <SegmentedControlItem
              key={value}
              value={value}
              label={accessibleLabel}
              isLabelHidden
              icon={<span className="settings-minute-format-preview" aria-hidden="true">{label}</span>}
            />
          ))}
        </SegmentedControl>
      </div>
    </div>
  )
}
