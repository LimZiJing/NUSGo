import { Button } from '@base-ui/react/button'
import { MoonIcon, SunIcon } from './icons'
import type { Theme } from './theme'

type ThemeToggleProps = {
  readonly theme: Theme
  readonly onToggle: () => void
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <Button
      className="theme-toggle"
      type="button"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={onToggle}
    >
      {theme === 'dark' ? <MoonIcon className="theme-toggle-icon" /> : <SunIcon className="theme-toggle-icon" />}
    </Button>
  )
}
