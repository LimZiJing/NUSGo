import type { CSSProperties, Ref } from 'react'
import { getRouteChipTextColor } from './route-color'

type RouteChipSize = 'default' | 'compact'

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
  readonly size?: RouteChipSize
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
  size = 'default',
}: RouteChipProps) {
  return (
    <button
      ref={buttonRef}
      className="route-chip"
      type="button"
      data-route-id={routeId}
      data-explore-focus-id={focusId}
      data-active={active ? 'true' : undefined}
      data-size={size}
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

export function PublicServiceChip({
  serviceNumber,
  size = 'default',
}: { readonly serviceNumber: string; readonly size?: RouteChipSize }) {
  return (
    <span className="route-chip route-chip-public" data-size={size} title={`Public service ${serviceNumber}`}>
      <span className="visually-hidden">Public service </span>
      {serviceNumber}
    </span>
  )
}
