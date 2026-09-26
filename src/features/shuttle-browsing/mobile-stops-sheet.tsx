import type { Ref } from 'react'

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
      ref={containerRef}
    >
      <header className="mobile-stops-sheet-header">
        <h2 id="mobile-stops-sheet-heading">Stops</h2>
        <button
          type="button"
          aria-controls="mobile-stops-sheet-content"
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide stops panel' : 'Show stops panel'}
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? 'Hide' : 'Show'}
        </button>
      </header>
      <div id="mobile-stops-sheet-content" hidden={!expanded}>
        <p>Tap a shuttle stop on the map to view its details and route actions.</p>
      </div>
    </section>
  )
}
