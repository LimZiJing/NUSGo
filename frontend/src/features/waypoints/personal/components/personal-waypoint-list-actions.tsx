import { useEffect, useRef, useState } from 'react'
import { IconButton } from '../../../../ui/button'
import { EllipsisVerticalIcon } from '../../../../ui/icons'
import { MenuItem } from '../../../../ui/menu-item'

export function PersonalWaypointListActions({
  editing,
  hasSearchFilter,
  onToggleEditing,
  onClearAll,
}: {
  readonly editing: boolean
  readonly hasSearchFilter: boolean
  readonly onToggleEditing: () => void
  readonly onClearAll: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  const closeMenu = (restoreFocus = true): void => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  const clearAll = (): void => {
    if (hasSearchFilter) return
    if (window.confirm('Clear all personal waypoints, including places hidden by filters?')) onClearAll()
    closeMenu()
  }

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent): void => {
      if (rootRef.current?.contains(event.target as Node | null)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [open])

  return <div
    ref={rootRef}
    className="personal-waypoint-list-actions"
    data-menu-open={open ? 'true' : undefined}
    onKeyDown={(event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closeMenu()
    }}
  >
    <IconButton
      className="personal-waypoint-list-actions-trigger"
      label="Waypoint list options"
      icon={<EllipsisVerticalIcon />}
      title="Waypoint list options"
      expanded={open}
      controls="personal-waypoint-list-actions-menu"
      onClick={() => setOpen((current) => !current)}
      ref={triggerRef}
    />
    {open && <div
      id="personal-waypoint-list-actions-menu"
      className="personal-waypoint-list-actions-menu"
      role="group"
      aria-label="Waypoint list actions"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeMenu(false)
      }}
    >
      <MenuItem
        label={editing ? 'Done' : 'Edit list'}
        onClick={() => {
          onToggleEditing()
          closeMenu()
        }}
      />
      <MenuItem label="Clear all" disabled={hasSearchFilter} onClick={clearAll} />
    </div>}
  </div>
}
