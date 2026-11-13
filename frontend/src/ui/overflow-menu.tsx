import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { EllipsisVerticalIcon } from './icons'
import { IconButton } from './button'

interface OverflowMenuProps {
  /** The trigger's accessible name, e.g. "Waypoint list options". */
  readonly label: string
  /** Names the popup group for assistive technology. */
  readonly menuLabel: string
  readonly children: ReactNode
  readonly disabled?: boolean
  readonly className?: string
  /** Optional ref to the trigger so a caller can restore focus to it. */
  readonly triggerRef?: (element: HTMLButtonElement | null) => void
}

/**
 * A single vertical-ellipsis menu. The app keeps ONE of these per screen: a collection can offer
 * its commands through it and a details view can offer its record actions through it, but they are
 * never stacked, so the "many triple-dot menus" problem cannot come back.
 *
 * Closing always returns focus to the trigger. Escape is consumed here so the surrounding panel does
 * not also close, and Tab or an outside press dismisses the menu.
 */
export function OverflowMenu({ label, menuLabel, children, disabled = false, className, triggerRef }: OverflowMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const menuId = useId()

  const close = (restoreFocus = true): void => {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onOutsidePress = (event: PointerEvent): void => {
      if (rootRef.current?.contains(event.target as Node | null)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onOutsidePress)
    return () => document.removeEventListener('pointerdown', onOutsidePress)
  }, [open])

  return <div
    ref={rootRef}
    className={['overflow-menu', className].filter(Boolean).join(' ')}
    data-menu-open={open ? 'true' : undefined}
    // A menu owns Escape while it is open, so the panel behind it stays put.
    data-owns-escape={open ? 'true' : undefined}
    onKeyDown={(event) => {
      if (event.key !== 'Escape' || !open) return
      event.preventDefault()
      event.stopPropagation()
      close()
    }}
  >
    <IconButton
      className="overflow-menu-trigger"
      label={label}
      icon={<EllipsisVerticalIcon />}
      variant="plain"
      disabled={disabled}
      expanded={open}
      controls={menuId}
      onClick={() => setOpen((current) => !current)}
      ref={(element) => {
        buttonRef.current = element
        triggerRef?.(element)
      }}
    />
    {open && <div
      id={menuId}
      className="overflow-menu-popup"
      role="group"
      aria-label={menuLabel}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(false)
      }}
      // Choosing an item closes the menu; the action runs first because it fires during the bubble
      // to this handler. Focus is left to the action, which usually moves it somewhere meaningful.
      onClick={() => close(false)}
    >
      {children}
    </div>}
  </div>
}
