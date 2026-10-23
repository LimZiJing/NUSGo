import type { ThemePreference } from '../../../ui/theme'

interface AppearanceSectionProps {
  readonly preference: ThemePreference
  readonly onChange: (preference: ThemePreference) => void
}

const THEME_CHOICES: readonly { readonly value: ThemePreference; readonly label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function AppearanceSection({ preference, onChange }: AppearanceSectionProps) {
  return (
    <section className="settings-section" aria-labelledby="settings-appearance-heading">
      <fieldset className="settings-choice-group">
        <legend id="settings-appearance-heading">Appearance</legend>
        {THEME_CHOICES.map(({ value, label }) => (
          <label className="settings-choice" key={value}>
            <input
              type="radio"
              name="theme-preference"
              value={value}
              checked={preference === value}
              onChange={() => onChange(value)}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
    </section>
  )
}
