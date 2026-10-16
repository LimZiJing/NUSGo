import type { ReactNode } from 'react'
import { IconButton } from '../button'
import { ArrowLeftIcon } from '../icons'
import { ScrollArea } from '../scroll-area'

interface MobileMapDetailOverlayProps {
  readonly label: string
  readonly backLabel: string
  readonly onBack: () => void
  readonly identity: ReactNode
  readonly headerAction: ReactNode
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
  headerAction,
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
        <div className="mobile-detail-header-action">{headerAction}</div>
      </header>
      {(bottomHeading || (bottom !== undefined && bottom !== null)) && (
        <section
          className={`mobile-detail-bottom${bottom === undefined || bottom === null ? ' mobile-detail-bottom--heading-only' : ''}`}
          aria-label={bottomLabel}
        >
          {bottomHeading && (
            <div className="mobile-detail-bottom-heading">{bottomHeading}</div>
          )}
          {bottom !== undefined && bottom !== null && (
            <ScrollArea className="mobile-detail-bottom-content ui-scroll-area-panel-gutter">
              {bottom}
            </ScrollArea>
          )}
        </section>
      )}
    </div>
  )
}
