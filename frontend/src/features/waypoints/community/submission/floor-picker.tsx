import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { FLOOR_UNSET, OTHER_FLOOR } from './draft'

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
    const selectedRadio = scrollAreaRef.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked')
    const selectedChoice = selectedRadio?.closest<HTMLElement>('.community-waypoint-floor-option')
    selectedChoice?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
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
    scrollArea.scrollBy({ left: direction * distance, behavior: 'smooth' })
  }

  const otherFloorValue = displayedOtherFloor.trim() === '' || !Number.isFinite(Number(displayedOtherFloor))
    ? null
    : Number(displayedOtherFloor)

  return (
    <div id="community-submission-floor" className="community-waypoint-field community-waypoint-field--floor">
      <span className="community-waypoint-field-label" id="community-submission-floor-label">Floor</span>
      <div
        className="route-chip-scroller"
        data-can-scroll-left={scrollState.canScrollLeft ? 'true' : undefined}
        data-can-scroll-right={scrollState.canScrollRight ? 'true' : undefined}
      >
        <div
          ref={scrollAreaRef}
          className="route-chip-list community-waypoint-floor-scroll"
          onScroll={(event) => updateScrollState(event.currentTarget)}
        >
          <RadioList
            label="Floor"
            isLabelHidden
            orientation="horizontal"
            value={selectedValue}
            htmlName="floor"
            status={error ? { type: 'error', message: error } : undefined}
            controlClassName="community-waypoint-floor-options"
            onChange={(value) => onFloorChange(value === FLOOR_UNSET ? '' : value)}
          >
            {choices.map(({ value, label }) => (
              <RadioListItem
                key={value}
                value={value}
                label={label}
                className="route-chip community-waypoint-floor-option"
                data-floor-unset={value === FLOOR_UNSET ? 'true' : undefined}
              />
            ))}
          </RadioList>
        </div>
        {scrollState.canScrollLeft && <IconButton
          className="route-scroll-arrow route-scroll-arrow-left"
          label="Scroll floor options left"
          icon={<Icon icon="chevronLeft" />}
          onClick={() => scroll(-1)}
        />}
        {scrollState.canScrollRight && <IconButton
          className="route-scroll-arrow route-scroll-arrow-right"
          label="Scroll floor options right"
          icon={<Icon icon="chevronRight" />}
          onClick={() => scroll(1)}
        />}
      </div>
      {selectedValue === OTHER_FLOOR && <div className="community-waypoint-floor-other-panel">
        <span className="community-waypoint-floor-other-label">
          Other floor number
        </span>
        <NumberInput
          id="community-submission-other-floor"
          label="Other floor number"
          isLabelHidden
          htmlName="otherFloor"
          value={otherFloorValue}
          hasClear
          isIntegerOnly
          step={1}
          isWheelEnabled={false}
          hasNumberSteppers={false}
          placeholder="e.g. -3"
          status={error ? { type: 'error', message: error } : undefined}
          containerClassName="community-waypoint-floor-other-astryx-field"
          controlClassName="community-waypoint-floor-other-control"
          onChange={(value) => onOtherFloorChange(value === null ? '' : String(value))}
        />
      </div>}
    </div>
  )
}
