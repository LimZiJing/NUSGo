import type { Ref } from 'react'
import { MobileSheetHandle } from '../../ui/mobile-sheet-handle'

interface MobileStopsSheetProps {
  readonly expanded: boolean
  readonly onExpandedChange: (expanded: boolean) => void
  readonly containerRef?: Ref<HTMLElement>
}

export function MobileStopsSheet({
  expanded,
  onExpandedChange,
  containerRef,
}: MobileStopsSheetProps) {
  return (
    <section
      className="mobile-stops-sheet"
      aria-labelledby="mobile-stops-sheet-heading"
      data-mobile-sheet
      data-expanded={expanded}
      ref={containerRef}
    >
      <div className="mobile-sheet-handle-row">
        <MobileSheetHandle
          expanded={expanded}
          label="Stops panel"
          controlsId="mobile-stops-sheet-content"
          onExpandedChange={onExpandedChange}
        />
      </div>
      <header className="mobile-stops-sheet-header">
        <h2 id="mobile-stops-sheet-heading">Stops</h2>
      </header>
      <div
        id="mobile-stops-sheet-content"
        data-mobile-sheet-content
        hidden={!expanded}
      >
        <p>Tap a shuttle stop on the map to view its details and route actions.</p>
      </div>
    </section>
  )
}
