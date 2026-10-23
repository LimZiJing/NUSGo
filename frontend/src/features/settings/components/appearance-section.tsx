import type { ThemePreference } from '../../../ui/theme'
import { MonitorIcon, MoonIcon, SunIcon } from '../../../ui/icons'

interface AppearanceSectionProps {
  readonly preference: ThemePreference
  readonly onChange: (preference: ThemePreference) => void
}

const THEME_CHOICES = [
  { value: 'system', label: 'System', Icon: MonitorIcon },
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
] as const

export function AppearanceSection({ preference, onChange }: AppearanceSectionProps) {
  return (
    <section className="settings-section" aria-labelledby="settings-appearance-heading">
      <fieldset className="settings-choice-group">
        <legend id="settings-appearance-heading">Appearance</legend>
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
      </fieldset>
    </section>
  )
}
