import type { Theme } from './theme'

type ThemeToggleProps = {
  readonly theme: Theme
  readonly onToggle: () => void
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={onToggle}
    >
      {nextTheme === 'dark' ? 'Dark' : 'Light'}
    </button>
  )
}
