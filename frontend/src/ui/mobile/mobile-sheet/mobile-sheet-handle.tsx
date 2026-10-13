import type { KeyboardEvent } from 'react'
import {
  isOpenMobileSheetDetent,
  type MobileSheetDetent,
} from './mobile-sheet-detent'

interface MobileSheetHandleProps {
  readonly detent: MobileSheetDetent
  readonly label: string
  readonly controlsId: string
  readonly onButtonRef?: (button: HTMLButtonElement | null) => void
  readonly onDetentChange: (detent: MobileSheetDetent) => void
}

function provideSheetSnapFeedback(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  navigator.vibrate(10)
}

// A tap toggles the two open detents; collapsing is a separate action (swipe down or
// ArrowDown) so the mid-height detent that shows both content and map stays reachable.
function getToggledDetent(detent: MobileSheetDetent): MobileSheetDetent {
  return detent === 'partial' ? 'full' : 'partial'
}

function getArrowDetent(detent: MobileSheetDetent, key: string): MobileSheetDetent {
  if (key === 'ArrowUp') return detent === 'collapsed' ? 'partial' : 'full'
  return detent === 'full' ? 'partial' : 'collapsed'
}

export function MobileSheetHandle({
  detent,
  label,
  controlsId,
  onButtonRef,
  onDetentChange,
}: MobileSheetHandleProps) {
  const changeDetent = (nextDetent: MobileSheetDetent): void => {
    if (nextDetent === detent) return
    provideSheetSnapFeedback()
    onDetentChange(nextDetent)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    changeDetent(getArrowDetent(detent, event.key))
  }

  const handleAction = detent === 'full' ? 'Reduce' : 'Expand'

  return (
    <button
      type="button"
      className="mobile-sheet-handle"
      ref={onButtonRef}
      aria-controls={controlsId}
      aria-expanded={isOpenMobileSheetDetent(detent)}
      aria-label={`${handleAction} ${label}`}
      aria-description="Press Up or Down Arrow to change the sheet height. Down Arrow at partial height collapses it."
      onClick={() => changeDetent(getToggledDetent(detent))}
      onKeyDown={handleKeyDown}
    >
      <span aria-hidden="true" className="mobile-sheet-grabber" />
    </button>
  )
}
