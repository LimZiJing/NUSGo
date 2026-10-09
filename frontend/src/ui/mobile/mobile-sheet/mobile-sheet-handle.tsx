import type { MouseEvent } from 'react'
import {
  isOpenMobileSheetDetent,
  type MobileSheetDetent,
  type OpenMobileSheetDetent,
} from './mobile-sheet-detent'

interface MobileSheetHandleProps {
  readonly detent: MobileSheetDetent
  readonly restoreDetent?: OpenMobileSheetDetent
  readonly label: string
  readonly controlsId: string
  readonly onButtonRef?: (button: HTMLButtonElement | null) => void
  readonly onDetentChange: (detent: MobileSheetDetent) => void
}

function provideSheetSnapFeedback(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  navigator.vibrate(10)
}

export function MobileSheetHandle({
  detent,
  restoreDetent = 'partial',
  label,
  controlsId,
  onButtonRef,
  onDetentChange,
}: MobileSheetHandleProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    const nextDetent: MobileSheetDetent = detent === 'collapsed'
      ? restoreDetent
      : detent === 'partial' ? 'full' : 'collapsed'
    const content = document.getElementById(controlsId)
    if (nextDetent === 'collapsed' && content?.contains(document.activeElement)) {
      event.currentTarget.focus()
    }
    if (nextDetent !== detent) provideSheetSnapFeedback()
    onDetentChange(nextDetent)
  }

  const handleAction = detent === 'full' ? 'Collapse' : 'Expand'

  return (
    <button
      type="button"
      className="mobile-sheet-handle"
      ref={onButtonRef}
      aria-controls={controlsId}
      aria-expanded={isOpenMobileSheetDetent(detent)}
      aria-label={`${handleAction} ${label}`}
      aria-description={detent === 'partial' ? 'Opens the full-height sheet.' : undefined}
      onClick={handleClick}
    >
      <span aria-hidden="true" className="mobile-sheet-grabber" />
    </button>
  )
}
