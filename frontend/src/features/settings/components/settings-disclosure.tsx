import type { ReactNode } from 'react'
import { ChevronRightIcon } from '../../../ui/icons'
import '../styles/settings-disclosures.css'

interface SettingsDisclosureProps {
  readonly title: string
  readonly trailing?: ReactNode
  readonly children: ReactNode
  readonly defaultOpen?: boolean
}

export function SettingsDisclosure({
  title,
  trailing,
  children,
  defaultOpen = false,
}: SettingsDisclosureProps) {
  return (
    <details className="settings-disclosure" open={defaultOpen}>
      <summary className="settings-disclosure-summary">
        <span className="settings-disclosure-title">{title}</span>
        {trailing && <span className="settings-disclosure-trailing">{trailing}</span>}
        <ChevronRightIcon className="settings-disclosure-chevron" size={18} />
      </summary>
      <div className="settings-disclosure-content">{children}</div>
    </details>
  )
}
