import type { CSSProperties, Ref } from 'react'
import { getRouteChipTextColor } from './route-color'

interface RouteChipProps {
  readonly routeId: string
  readonly routeColor: string
  readonly ariaLabel: string
  readonly onClick: () => void
  readonly active?: boolean
  readonly pressed?: boolean
  readonly title?: string
  readonly focusId?: string
  readonly buttonRef?: Ref<HTMLButtonElement>
}

export function RouteChip({
  routeId,
  routeColor,
  ariaLabel,
  onClick,
  active = false,
  pressed,
  title,
  focusId,
  buttonRef,
}: RouteChipProps) {
  return (
    <button
      ref={buttonRef}
      className="route-chip"
      type="button"
      data-route-id={routeId}
      data-contextual-focus-id={focusId}
      data-active={active ? 'true' : undefined}
      style={{
        '--route-color': routeColor,
        '--route-text-color': getRouteChipTextColor(routeColor),
      } as CSSProperties}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      title={title}
      onClick={onClick}
    >
      {routeId}
    </button>
  )
}
