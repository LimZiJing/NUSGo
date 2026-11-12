import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDownIcon } from '../../../ui/icons'
import { PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH } from '../../../domain/waypoints/personal/personal-waypoint'

export function ConnectedCategoryPicker({
  category,
  options,
  onSelect,
  invalid = false,
  describedBy,
  id,
  label = 'Category',
}: {
  readonly category: string
  readonly options: readonly string[]
  readonly onSelect: (category: string) => void
  readonly invalid?: boolean
  readonly describedBy?: string
  readonly id: string
  readonly label?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(category)
  const [hasTyped, setHasTyped] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const blurFrame = useRef<number | null>(null)
  const instanceId = useId()
  const listId = `${instanceId}-listbox`
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = options.filter((option) => !hasTyped || !normalizedQuery || option.toLocaleLowerCase().includes(normalizedQuery))
  const createValue = query.trim()
  const canCreate = Boolean(createValue) && !options.some((option) => option.toLocaleLowerCase() === createValue.toLocaleLowerCase())
  const choices = [...filtered.map((value) => ({ label: value, category: value })), ...(canCreate ? [{ label: `Create “${createValue}”`, category: createValue }] : [])]
  const activeIndex = Math.min(highlighted, Math.max(0, choices.length - 1))

  const close = useCallback((): void => {
    setOpen(false)
    setQuery(category)
    setHasTyped(false)
    setHighlighted(0)
  }, [category])
  const commit = (choice: { readonly label: string; readonly category: string }): void => {
    const selectedCategory = choice.category
    onSelect(selectedCategory)
    setOpen(false)
    setQuery(selectedCategory)
  }
  useLayoutEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !root.current?.contains(event.target) && !popupRef.current?.contains(event.target)) close()
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [open, close])

  useLayoutEffect(() => {
    if (!open) return
    const reposition = (): void => {
      const bounds = root.current?.getBoundingClientRect()
      if (!bounds) return
      const popup = popupRef.current
      if (!popup) return
      const viewport = window.visualViewport
      const viewportTop = viewport?.offsetTop ?? 0
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight)
      const spaceBelow = viewportBottom - bounds.bottom - 8
      const spaceAbove = bounds.top - viewportTop - 8
      const showAbove = spaceBelow < 120 && spaceAbove > spaceBelow
      // Fixed positioning and DOM bounds share layout-viewport coordinates.
      popup.style.left = `${bounds.left}px`
      popup.style.width = `${bounds.width}px`
      popup.dataset.side = showAbove ? 'top' : 'bottom'
      if (root.current) root.current.dataset.side = showAbove ? 'top' : 'bottom'
      const maxHeight = Math.max(0, Math.min(256, showAbove ? spaceAbove : spaceBelow))
      popup.style.maxHeight = `${maxHeight}px`
      popup.style.top = `${showAbove ? bounds.top - popup.getBoundingClientRect().height : bounds.bottom}px`
    }
    // The sheet can move after resize/scroll events, so follow its rendered
    // position while the results are open, including during sheet transitions.
    let positionFrame = 0
    const followAnchor = (): void => {
      reposition()
      positionFrame = requestAnimationFrame(followAnchor)
    }
    followAnchor()
    return () => {
      cancelAnimationFrame(positionFrame)
    }
  }, [choices.length, open, query])

  useEffect(() => {
    if (!open) return
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, listId, activeIndex, query])

  useEffect(() => () => {
    if (blurFrame.current !== null) cancelAnimationFrame(blurFrame.current)
  }, [])

  return <div className="connected-category-picker" ref={root} data-owns-escape={open ? 'true' : undefined}
    onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        close()
      }
    }}>
    <div className="personal-waypoint-category-input-group" data-open={open}>
      <input ref={input} id={id} maxLength={PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH + 1} role="combobox" aria-label={label} aria-autocomplete="list"
        aria-expanded={open} aria-controls={open ? listId : undefined} aria-haspopup="listbox" aria-invalid={invalid || undefined}
        aria-activedescendant={open && choices[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        aria-describedby={describedBy} value={open ? query : category}
        onFocus={() => { if (!open) { setQuery(category); setHasTyped(false); setOpen(true); input.current?.select() } }}
        onClick={() => { if (!open) { setQuery(category); setHasTyped(false); setOpen(true); input.current?.select() }} }
        onBlur={() => {
          if (blurFrame.current !== null) cancelAnimationFrame(blurFrame.current)
          blurFrame.current = requestAnimationFrame(() => {
            blurFrame.current = null
            if (!root.current?.contains(document.activeElement)) close()
          })
        }}
        onChange={(event) => { setQuery(event.target.value); setHasTyped(true); setHighlighted(0); setOpen(true) }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && open && choices.length) { event.preventDefault(); setHighlighted(Math.min(activeIndex + 1, choices.length - 1)) }
          else if (event.key === 'ArrowUp' && open) { event.preventDefault(); setHighlighted(Math.max(activeIndex - 1, 0)) }
          else if (event.key === 'Enter' && open && choices[activeIndex]) { event.preventDefault(); commit(choices[activeIndex]) }
        }} />
      <button type="button" className="personal-waypoint-category-trigger" aria-label={`Show ${label.toLocaleLowerCase()} options`} aria-controls={open ? listId : undefined} aria-expanded={open}
        onClick={() => { if (open) close(); else { setQuery(category); setHasTyped(false); setOpen(true); input.current?.focus() } }}>
        <ChevronDownIcon size={16} />
      </button>
    </div>
    {open && createPortal(<div ref={popupRef} className="personal-waypoint-category-popup" role="listbox" aria-label={`${label} options`} id={listId} data-owns-escape="true">
      {choices.length === 0 && <div className="personal-waypoint-category-empty">No matches</div>}
      {choices.map(({ label, category: choiceCategory }, index) => <div key={`${index}-${label}`} id={`${listId}-${index}`} role="option" aria-selected={choiceCategory.toLocaleLowerCase() === category.toLocaleLowerCase()}
        className="personal-waypoint-category-item" data-highlighted={index === activeIndex} data-current={choiceCategory.toLocaleLowerCase() === category.toLocaleLowerCase() || undefined}
        onPointerMove={() => setHighlighted(index)} onPointerDown={(event) => event.preventDefault()}
        onClick={() => commit(choices[index])}>{label}</div>)}
    </div>, document.body)}
  </div>
}
