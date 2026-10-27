import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { joinClassNames } from './class-names'
import { DisclosureChevron } from './disclosure-chevron'
import { CheckIcon } from './icons'

export interface SelectOption {
  readonly value: string
  readonly label: string
}

interface SelectProps {
  /** Visible label above the trigger; also the accessible name of the listbox. */
  readonly label: string
  readonly value: string
  readonly options: readonly SelectOption[]
  readonly onChange: (value: string) => void
  readonly id?: string
  /** Hides the label visually (it stays the accessible name) when the context already says what the control is. */
  readonly hideLabel?: boolean
  /** Layout only, such as width or margins; the look comes from the tokens. */
  readonly className?: string
}

const LIST_MAX_HEIGHT = 224
const LIST_MIN_WIDTH = 160
const LIST_GAP = 4
const VIEWPORT_MARGIN = 8

/** Fixed position for the list: under the trigger, or above it when there is more room there. */
function placeList(trigger: HTMLElement): CSSProperties {
  const rect = trigger.getBoundingClientRect()
  const width = Math.min(window.innerWidth - VIEWPORT_MARGIN * 2, Math.max(rect.width, LIST_MIN_WIDTH))
  const below = window.innerHeight - rect.bottom - LIST_GAP - VIEWPORT_MARGIN
  const above = rect.top - LIST_GAP - VIEWPORT_MARGIN
  const openAbove = below < Math.min(LIST_MAX_HEIGHT, 160) && above > below
  const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN))
  return {
    left,
    width,
    maxHeight: Math.max(96, Math.min(LIST_MAX_HEIGHT, openAbove ? above : below)),
    ...(openAbove
      ? { bottom: window.innerHeight - rect.top + LIST_GAP }
      : { top: rect.bottom + LIST_GAP }),
  }
}

/**
 * A themed dropdown. The option list floats over the page in a portal (fixed to the trigger), so
 * it never pushes other content down and no scroll container or bottom sheet clips it.
 */
export function Select({ label, value, options, onChange, id, hideLabel, className }: SelectProps) {
  const generatedId = useId()
  const baseId = id ?? `select-${generatedId}`
  const labelId = `${baseId}-label`
  const listId = `${baseId}-list`
  const optionId = (index: number) => `${baseId}-option-${index}`

  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [listStyle, setListStyle] = useState<CSSProperties>({})

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selectedLabel = options[selectedIndex]?.label ?? ''
  const lastIndex = Math.max(options.length - 1, 0)

  // The list is fixed to the viewport, so it follows the trigger through scrolls and resizes.
  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    if (!trigger) return
    const update = () => setListStyle(placeList(trigger))
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  // Focus moves into the list when it opens, so arrow keys and Escape work straight away.
  useEffect(() => {
    if (open) listRef.current?.focus()
  }, [open])

  // Keep the active option visible inside the scrolling list.
  useEffect(() => {
    if (!open) return
    document.getElementById(`${baseId}-option-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [baseId, open, activeIndex])

  function openList() {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }

  function closeList() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function choose(index: number) {
    const next = options[index]
    if (next && next.value !== value) onChange(next.value)
    closeList()
  }

  function handleTriggerClick() {
    if (open) closeList()
    else openList()
  }

  // Keep focus on the trigger while the list is open, so Safari does not treat the click as a blur.
  function handleTriggerMouseDown(event: MouseEvent<HTMLButtonElement>) {
    if (open) event.preventDefault()
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    // Enter and Space open through the native click that the browser fires for them.
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      openList()
    }
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((index) => Math.min(index + 1, lastIndex))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((index) => Math.max(index - 1, 0))
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(lastIndex)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        choose(activeIndex)
        break
      case 'Escape':
        event.preventDefault()
        closeList()
        break
      // Tab is left alone: focus moves on, and handleBlur closes the list.
    }
  }

  // Closes the list when focus leaves the component, which covers clicks outside and Tab.
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget
    // The list lives in a portal, so containment is checked against both elements, not the wrapper.
    if (next instanceof Node && (triggerRef.current?.contains(next) || listRef.current?.contains(next))) return
    setOpen(false)
  }

  return (
    <div className={joinClassNames('select', className)} onBlur={handleBlur}>
      <label id={labelId} htmlFor={baseId} className={joinClassNames('select-label', hideLabel ? 'visually-hidden' : undefined)}>
        {label}
      </label>
      <button
        ref={triggerRef}
        id={baseId}
        className="select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${labelId} ${baseId}`}
        data-hover-filter="none"
        title={selectedLabel}
        onClick={handleTriggerClick}
        onMouseDown={handleTriggerMouseDown}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="select-trigger-value">{selectedLabel}</span>
        <DisclosureChevron expanded={open} className="select-trigger-chevron" />
      </button>
      {open && createPortal(
        <ul
          ref={listRef}
          id={listId}
          className="select-list"
          style={listStyle}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-activedescendant={optionId(activeIndex)}
          onKeyDown={handleListKeyDown}
        >
          {options.map((option, index) => {
            const selected = index === selectedIndex
            return (
              <li
                key={option.value}
                id={optionId(index)}
                className="select-option"
                role="option"
                aria-selected={selected}
                data-active={index === activeIndex ? 'true' : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
              >
                <CheckIcon className="select-option-check" />
                <span className="select-option-label">{option.label}</span>
              </li>
            )
          })}
        </ul>,
        document.body,
      )}
    </div>
  )
}
