import type { ReactNode } from 'react'
import { IconButton } from '../button'
import { ArrowLeftIcon } from '../icons'

interface MobileMapDetailOverlayProps {
  readonly label: string
  readonly backLabel: string
  readonly onBack: () => void
  readonly identity: ReactNode
  readonly trailingAction: ReactNode
  readonly navigateAction: ReactNode
  readonly bottomLabel?: string
  readonly bottomHeading?: ReactNode
  readonly bottom?: ReactNode
  readonly id?: string
  readonly testId?: string
}

export function MobileMapDetailOverlay({
  label,
  backLabel,
  onBack,
  identity,
  trailingAction,
  navigateAction,
  bottomLabel,
  bottomHeading,
  bottom,
  id,
  testId,
}: MobileMapDetailOverlayProps) {
  return (
    <div
      id={id}
      data-testid={testId}
      className="mobile-detail-surface"
      role="region"
      aria-label={label}
    >
      <header className="mobile-detail-header">
        <IconButton
          className="mobile-detail-back"
          variant="ghost"
          label={backLabel}
          title={backLabel}
          icon={<ArrowLeftIcon />}
          onClick={onBack}
        />
        <div className="mobile-detail-header-identity">{identity}</div>
        <div className="mobile-detail-header-action">{trailingAction}</div>
      </header>
      <div className="mobile-detail-navigate">{navigateAction}</div>
      {bottom !== undefined && bottom !== null && (
        <section className="mobile-detail-bottom" aria-label={bottomLabel}>
          {bottomHeading && (
            <div className="mobile-detail-bottom-heading">{bottomHeading}</div>
          )}
          <div className="mobile-detail-bottom-content">{bottom}</div>
        </section>
      )}
    </div>
  )
}
