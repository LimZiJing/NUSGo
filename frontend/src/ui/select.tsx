import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react'
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

/**
 * A themed dropdown. The option list renders in normal flow under the trigger rather than
 * in a popover, so scroll containers and bottom sheets never clip it.
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

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selectedLabel = options[selectedIndex]?.label ?? ''
  const lastIndex = Math.max(options.length - 1, 0)

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
    if (next instanceof Node && event.currentTarget.contains(next)) return
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
      {open && (
        <ul
          ref={listRef}
          id={listId}
          className="select-list"
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
        </ul>
      )}
    </div>
  )
}
