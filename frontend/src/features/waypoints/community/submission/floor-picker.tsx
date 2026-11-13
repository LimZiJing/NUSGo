import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Field } from '@base-ui/react/field'
import { Input } from '@base-ui/react/input'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Button } from '../../../../ui/button'
import { ScrollArea } from '../../../../ui/scroll-area'
import { FLOOR_UNSET, OTHER_FLOOR } from './draft'
import { SubmissionField } from './field'

const DEFAULT_FLOORS = [-1, 0, 1, 2, 3, 4, 5] as const

interface FloorOption {
  readonly value: string
  readonly label: string
}

function floorLabel(floor: number): string {
  if (floor === 0) return 'G'
  return floor < 0 ? `B${Math.abs(floor)}` : String(floor)
}

export function FloorPicker({
  floor,
  otherFloor,
  observedFloors,
  error,
  onFloorChange,
  onOtherFloorChange,
}: {
  readonly floor: string
  readonly otherFloor: string
  readonly observedFloors: readonly number[] | undefined
  readonly error: string | undefined
  readonly onFloorChange: (value: string) => void
  readonly onOtherFloorChange: (value: string) => void
}) {
  const [scrollState, setScrollState] = useState({ canScrollLeft: false, canScrollRight: false })
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const floorOptions = useMemo(() => {
    const floors = observedFloors?.length ? observedFloors : DEFAULT_FLOORS
    return floors.map((value) => ({ value: String(value), label: floorLabel(value) }))
  }, [observedFloors])
  const choices = useMemo<readonly FloorOption[]>(() => [
    { value: FLOOR_UNSET, label: 'Not set' },
    ...floorOptions,
    { value: OTHER_FLOOR, label: 'Other…' },
  ], [floorOptions])
  const selectedValue = floor === ''
    ? FLOOR_UNSET
    : floor === OTHER_FLOOR || !floorOptions.some(({ value }) => value === floor)
      ? OTHER_FLOOR
      : floor
  const displayedOtherFloor = floor === OTHER_FLOOR
    ? otherFloor
    : selectedValue === OTHER_FLOOR
      ? floor
      : otherFloor

  const updateScrollState = useCallback((element: HTMLElement): void => {
    const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth)
    const nextState = {
      canScrollLeft: element.scrollLeft > 4,
      canScrollRight: element.scrollLeft < maxScrollLeft - 4,
    }
    setScrollState((current) => (
      current.canScrollLeft === nextState.canScrollLeft && current.canScrollRight === nextState.canScrollRight
        ? current
        : nextState
    ))
  }, [])

  useLayoutEffect(() => {
    const selectedChoice = scrollAreaRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
    if (selectedChoice && typeof selectedChoice.scrollIntoView === 'function') {
      selectedChoice.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [selectedValue])

  useLayoutEffect(() => {
    const scrollArea = scrollAreaRef.current
    if (!scrollArea) return

    const update = (): void => updateScrollState(scrollArea)
    update()
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(update)
    observer.observe(scrollArea)
    if (scrollArea.firstElementChild) observer.observe(scrollArea.firstElementChild)
    return () => observer.disconnect()
  }, [choices, updateScrollState])

  const scroll = (direction: -1 | 1): void => {
    const scrollArea = scrollAreaRef.current
    if (!scrollArea) return
    const distance = Math.max(120, scrollArea.clientWidth * 0.75)
    if (typeof scrollArea.scrollBy === 'function') {
      scrollArea.scrollBy({ left: direction * distance, behavior: 'smooth' })
    } else {
      scrollArea.scrollLeft += direction * distance
    }
  }

  return (
    <SubmissionField
      id="community-submission-floor"
      name="floor"
      label="Floor"
      error={error}
      layout="floor"
    >
      <div
        className="route-chip-scroller"
        data-can-scroll-left={scrollState.canScrollLeft ? 'true' : undefined}
        data-can-scroll-right={scrollState.canScrollRight ? 'true' : undefined}
      >
        <ScrollArea
          ref={scrollAreaRef}
          axis="horizontal"
          className="route-chip-list community-waypoint-floor-scroll"
          onScroll={(event) => updateScrollState(event.currentTarget)}
        >
          <RadioGroup
            id="community-submission-floor-options"
            className="community-waypoint-floor-options"
            aria-orientation="horizontal"
            aria-labelledby="community-submission-floor-label"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'community-submission-floor-error' : undefined}
            value={selectedValue}
            onValueChange={(value) => onFloorChange(value === null || value === FLOOR_UNSET ? '' : value)}
          >
            {choices.map(({ value, label }) => {
              const labelId = `community-submission-floor-label-${value}`
              return <Radio.Root
                key={value}
                value={value}
                aria-labelledby={labelId}
                className="route-chip community-waypoint-floor-option"
                data-size="compact"
              >
                <span
                  id={labelId}
                  className={value === FLOOR_UNSET ? 'community-waypoint-floor-value--unset' : undefined}
                >
                  {label}
                </span>
              </Radio.Root>
            })}
          </RadioGroup>
        </ScrollArea>
        <Button
          className="route-scroll-arrow route-scroll-arrow-left"
          ariaLabel="Scroll floor options left"
          hidden={!scrollState.canScrollLeft}
          onClick={() => scroll(-1)}
        >
          <span aria-hidden="true">‹</span>
        </Button>
        <Button
          className="route-scroll-arrow route-scroll-arrow-right"
          ariaLabel="Scroll floor options right"
          hidden={!scrollState.canScrollRight}
          onClick={() => scroll(1)}
        >
          <span aria-hidden="true">›</span>
        </Button>
      </div>
      {selectedValue === OTHER_FLOOR && <Field.Root
        className="community-waypoint-floor-other-panel"
        name="otherFloor"
        invalid={Boolean(error)}
      >
        <Field.Label className="community-waypoint-floor-other-label" htmlFor="community-submission-other-floor">
          Other floor number
        </Field.Label>
        <Input
          id="community-submission-other-floor"
          name="otherFloor"
          className="community-waypoint-field-control community-waypoint-floor-other-input"
          type="number"
          step={1}
          placeholder="e.g. -3"
          value={displayedOtherFloor}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'community-submission-floor-error' : undefined}
          onChange={(event) => onOtherFloorChange(event.target.value)}
        />
      </Field.Root>}
    </SubmissionField>
  )
}
