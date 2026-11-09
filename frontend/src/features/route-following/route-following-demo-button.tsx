import type { BusRoute } from '@nusgo/shared/transit/types'
import { Button } from '../../ui/button'
import { ArrowRightIcon, RefreshIcon } from '../../ui/icons'

interface RouteFollowingDemoButtonProps {
  readonly route: BusRoute
  readonly activeRouteId: string | null
  readonly activeStopIndex: number | null
  readonly onDemo: (routeId: string) => void
}

export function RouteFollowingDemoButton({
  route,
  activeRouteId,
  activeStopIndex,
  onDemo,
}: RouteFollowingDemoButtonProps) {
  const isActive = route.id === activeRouteId
  const isAtEnd = isActive && activeStopIndex !== null && activeStopIndex >= route.stopIds.length - 1
  const label = isActive ? isAtEnd ? 'Restart' : 'Next' : `Demo ${route.id}`
  const accessibleLabel = isActive
    ? isAtEnd ? `Restart ${route.id} demo` : `Advance ${route.id} demo`
    : `Start ${route.id} demo`

  return <Button
    label={label}
    ariaLabel={accessibleLabel}
    title="Simulate route progress"
    icon={isAtEnd ? <RefreshIcon size={16} /> : <ArrowRightIcon size={16} />}
    className="route-following-demo-button"
    variant={isActive ? 'primary' : 'secondary'}
    onClick={() => onDemo(route.id)}
  />
}
