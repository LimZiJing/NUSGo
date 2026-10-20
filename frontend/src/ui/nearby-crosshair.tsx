import type { CSSProperties } from 'react'

export interface NearbyCrosshairInsets {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

export interface NearbyCrosshairProps {
  /** The same viewport insets the map camera uses, so the crosshair sits at the usable-area centre. */
  readonly insets: NearbyCrosshairInsets
}

/** Decorative, non-interactive marker for the map centre while Stops -> Nearby is open. */
export function NearbyCrosshair({ insets }: NearbyCrosshairProps) {
  return (
    <div
      className="nearby-crosshair-area"
      aria-hidden="true"
      style={{
        '--nearby-crosshair-top': `${insets.top}px`,
        '--nearby-crosshair-right': `${insets.right}px`,
        '--nearby-crosshair-bottom': `${insets.bottom}px`,
        '--nearby-crosshair-left': `${insets.left}px`,
      } as CSSProperties}
    >
      <span className="nearby-crosshair" />
    </div>
  )
}
