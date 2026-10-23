import type { ReactNode } from 'react'
import { ChevronRightIcon } from '../../../ui/icons'
import '../styles/settings-disclosures.css'

interface SettingsDisclosureRowProps {
  readonly icon: ReactNode
  readonly title: string
  readonly trailing?: ReactNode
  readonly children: ReactNode
}

export function SettingsDisclosureRow({
  icon,
  title,
  trailing,
  children,
}: SettingsDisclosureRowProps) {
  return (
    <details className="settings-disclosure">
      <summary className="settings-disclosure-summary">
        <span className="settings-disclosure-icon">{icon}</span>
        <span className="settings-disclosure-title">{title}</span>
        {trailing && <span className="settings-disclosure-trailing">{trailing}</span>}
        <ChevronRightIcon className="settings-disclosure-chevron" size={18} />
      </summary>
      <div className="settings-disclosure-content">{children}</div>
    </details>
  )
}
