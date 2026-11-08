import type { ReactNode } from 'react'
import { ChevronRightIcon } from '../../../ui/icons'
import '../styles/settings-disclosures.css'

interface SettingsDisclosureProps {
  readonly title: string
  readonly icon: ReactNode
  readonly subtitle?: string
  readonly trailing?: ReactNode
  readonly children: ReactNode
}

export function SettingsDisclosure({
  title,
  icon,
  subtitle,
  trailing,
  children,
}: SettingsDisclosureProps) {
  return (
    <details className="settings-disclosure">
      <summary className="settings-disclosure-summary">
        <span className="settings-disclosure-icon">{icon}</span>
        <span className="settings-disclosure-label">
          <span className="settings-disclosure-title">{title}</span>
          {subtitle && <span className="settings-disclosure-subtitle">{subtitle}</span>}
        </span>
        {trailing && <span className="settings-disclosure-trailing">{trailing}</span>}
        <ChevronRightIcon className="settings-disclosure-chevron" size={18} />
      </summary>
      <div className="settings-disclosure-content">{children}</div>
    </details>
  )
}
