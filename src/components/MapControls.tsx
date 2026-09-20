import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

export interface MapControlsProps {
  readonly visible: boolean
  readonly topOffset: number
  readonly onRootChange?: (root: HTMLDivElement | null) => void
  readonly open?: boolean
  readonly onOpenChange?: (open: boolean) => void
  readonly onZoomIn: () => void
  readonly onZoomOut: () => void
  readonly onReset: () => void
}

const POPOVER_ID = 'map-controls-popover'

export function MapControls({
  visible,
  topOffset,
  onRootChange,
  open: controlledOpen,
  onOpenChange,
  onZoomIn,
  onZoomOut,
  onReset,
}: MapControlsProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const rootRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLButtonElement>(null)

  const setOpen = useCallback((nextOpen: boolean): void => {
    onOpenChange?.(nextOpen)
    if (controlledOpen === undefined) setUncontrolledOpen(nextOpen)
  }, [controlledOpen, onOpenChange])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return
      setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      chipRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, setOpen])

  if (!visible) return null

  const setRootRef = (element: HTMLDivElement | null): void => {
    rootRef.current = element
    onRootChange?.(element)
  }

  const runAction = (action: () => void): void => {
    action()
    setOpen(false)
    chipRef.current?.focus()
  }

  return (
    <div
      className="map-controls"
      ref={setRootRef}
      style={{ '--map-controls-top': `${Math.max(0, topOffset)}px` } as CSSProperties}
    >
      <button
        className="map-controls-chip"
        type="button"
        ref={chipRef}
        aria-controls={POPOVER_ID}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Map controls
      </button>
      {open && (
        <div
          className="map-controls-popover"
          id={POPOVER_ID}
          role="group"
          aria-label="Map controls"
        >
          <button type="button" onClick={() => runAction(onZoomIn)}>Zoom in</button>
          <button type="button" onClick={() => runAction(onZoomOut)}>Zoom out</button>
          <button type="button" onClick={() => runAction(onReset)}>Reset view</button>
        </div>
      )}
    </div>
  )
}
