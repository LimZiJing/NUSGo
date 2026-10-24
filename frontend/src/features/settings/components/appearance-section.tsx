import type { ThemePreference } from '../../../ui/theme'
import { ChevronRightIcon, MonitorIcon, MoonIcon, SunIcon } from '../../../ui/icons'

interface AppearanceSectionProps {
  readonly preference: ThemePreference
  readonly onChange: (preference: ThemePreference) => void
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

export function AppearanceSection({ preference, onChange }: AppearanceSectionProps) {
  const selectedOtherTheme = OTHER_THEME_CHOICES.find(({ value }) => preference === value)

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
      <details className="settings-theme-disclosure">
        <summary className="settings-theme-summary">
          <span className="settings-theme-title">Other themes</span>
          {selectedOtherTheme && <span className="settings-theme-selected">{selectedOtherTheme.label}</span>}
          <ChevronRightIcon className="settings-theme-chevron" size={18} />
        </summary>
        <div className="settings-theme-options" role="group" aria-label="Other themes">
          {OTHER_THEME_CHOICES.map(({ value, label }) => (
            <label
              className="settings-theme-choice"
              data-selected={preference === value}
              data-theme-choice={value}
              key={value}
            >
              <input
                type="radio"
                name="theme-preference"
                value={value}
                checked={preference === value}
                onChange={() => onChange(value)}
              />
              <span className="settings-theme-swatch" aria-hidden="true" />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  )
}
