import { useEffect, useRef, useState } from 'react'
import { EllipsisVerticalIcon } from '../../../ui/icons'
import { IconButton } from '../../../ui/button'
import { MenuItem } from '../../../ui/menu-item'

interface TripActionsMenuProps {
  readonly disabled: boolean
  readonly onClear: () => void
}

export function TripActionsMenu({ disabled, onClear }: TripActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeMenu = (event: PointerEvent | KeyboardEvent): void => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return
      if (event instanceof PointerEvent) {
        const target = event.target
        if (target instanceof Node && menuRef.current?.contains(target)) return
      }
      setOpen(false)
    }
    // Document listeners let the menu close after an outside press or Escape from any focused control.
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeMenu)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeMenu)
    }
  }, [open])

  const clearTrip = (): void => {
    onClear()
    setOpen(false)
  }

  return (
    <div className="plan-content-menu" ref={menuRef}>
      <IconButton
        variant="plain"
        label="Trip actions"
        title="Trip actions"
        icon={<EllipsisVerticalIcon />}
        expanded={open}
        controls="plan-content-actions-menu"
        onClick={() => setOpen((current) => !current)}
      />
      {open && (
        <div id="plan-content-actions-menu" className="plan-content-menu-panel">
          <MenuItem label="Clear all" onClick={clearTrip} disabled={disabled} />
        </div>
      )}
    </div>
  )
}
