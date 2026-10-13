import type { Ref } from 'react'
import { getRouteContrastTextColor } from '../domain/transit/route-color'
import { Chip } from './chip'

type RouteChipSize = 'default' | 'small' | 'compact'

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
    <Chip
      ref={buttonRef}
      className="route-chip"
      label={routeId}
      size={size === 'default' ? 'lg' : 'sm'}
      selected={active}
      pressed={pressed}
      tone={{ fill: routeColor, text: getRouteContrastTextColor(routeColor) }}
      ariaLabel={ariaLabel}
      title={title}
      dataAttributes={{
        'data-route-id': routeId,
        'data-focus-id': focusId,
        'data-compact': size === 'compact' ? 'true' : undefined,
      }}
      onClick={onClick}
    />
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
