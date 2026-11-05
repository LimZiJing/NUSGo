import type { ThemePreference } from '../../../ui/theme'
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

const OTHER_THEME_CHOICES = [
  { value: 'nus', label: 'NUS' },
  { value: 'matcha', label: 'Matcha' },
  { value: 'sakura', label: 'Sakura' },
] as const

const OTHER_THEME_OPTIONS = OTHER_THEME_CHOICES.map(({ value, label }) => ({
  value,
  label,
  leading: <span className="settings-theme-swatch" data-theme-choice={value} />,
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
  const selectedOtherTheme = OTHER_THEME_CHOICES.find(({ value }) => preference === value)

  function handleOtherThemeChange(value: string) {
    const choice = OTHER_THEME_CHOICES.find((theme) => theme.value === value)
    if (choice) onChange(choice.value)
  }

  return (
    <div className="settings-appearance-card">
      <div
        className="settings-choice-group"
        role="radiogroup"
        aria-labelledby="settings-appearance-heading"
      >
        <div className="settings-choice-heading" id="settings-appearance-heading">
          Theme
        </div>
        <div className="settings-choice-options">
          {THEME_CHOICES.map(({ value, label, Icon }) => (
            <label
              className="settings-choice"
              data-selected={preference === value}
              key={value}
            >
              <input
                type="radio"
                name="theme-preference"
                value={value}
                checked={preference === value}
                onChange={() => onChange(value)}
              />
              <Icon className="settings-choice-icon" size={18} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="settings-choice-group">
        <div className="settings-choice-heading">Other themes</div>
        <Select
          label="Other themes"
          value={selectedOtherTheme?.value ?? ''}
          placeholder="Choose"
          options={OTHER_THEME_OPTIONS}
          onChange={handleOtherThemeChange}
          size="lg"
          checkPosition="end"
          hideLabel
          className="settings-theme-select"
        />
      </div>
      <div
        className="settings-choice-group"
        role="radiogroup"
        aria-labelledby="settings-minute-format-heading"
      >
        <div className="settings-choice-heading" id="settings-minute-format-heading">
          Minute format
        </div>
        <div className="settings-choice-options">
          {MINUTE_FORMAT_CHOICES.map(({ value, label, accessibleLabel }) => (
            <label
              className="settings-choice"
              data-selected={minuteFormat === value}
              key={value}
            >
              <input
                type="radio"
                name="minute-format"
                value={value}
                aria-label={accessibleLabel}
                checked={minuteFormat === value}
                onChange={() => onMinuteFormatChange(value)}
              />
              <span aria-hidden="true">{label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
