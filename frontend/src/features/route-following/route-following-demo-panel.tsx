import { useEffect, useState } from 'react'
import type { BusRoute, TransitStop } from '@nusgo/shared/transit/types'
import { getBusStopName } from '../../domain/transit'
import { Button } from '../../ui/button'
import type { RouteFollowingDemoController, RouteFollowingDemoLocationMode } from './route-following-demo-controller'
import type { RouteFollowingWorkflow } from './use-route-following'

type DemoWorkflow = Pick<
  RouteFollowingWorkflow,
  'activeRoute' | 'activeStops' | 'activeStopIndex' | 'currentStop'
>

interface RouteFollowingDemoPanelProps {
  readonly controller: RouteFollowingDemoController
  readonly workflow: DemoWorkflow
  readonly route: BusRoute | null
  readonly allStops: readonly TransitStop[]
  readonly routeStops: readonly TransitStop[]
}

const LOCATION_MODES: readonly { readonly value: RouteFollowingDemoLocationMode; readonly label: string }[] = [
  { value: 'tracking', label: 'Fresh, accurate fix' },
  { value: 'inaccurate', label: 'Inaccurate fix (40 m)' },
  { value: 'stale', label: 'Stale fix (31 s old)' },
  { value: 'denied', label: 'Location denied' },
  { value: 'disabled', label: 'Location off' },
]

export function RouteFollowingDemoPanel({
  controller,
  workflow,
  route,
  allStops,
  routeStops,
}: RouteFollowingDemoPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [snapshot, setSnapshot] = useState(controller.getSnapshot)
  const [locationStopId, setLocationStopId] = useState('')
  const [arrivalStopId, setArrivalStopId] = useState('')
  const [locationMode, setLocationMode] = useState<RouteFollowingDemoLocationMode>('tracking')
  const [offsetMeters, setOffsetMeters] = useState(0)
  const [arrivalService, setArrivalService] = useState<'internal' | 'public'>('internal')
  const [arrivalEta, setArrivalEta] = useState('none')
  const [speedMetersPerSecond, setSpeedMetersPerSecond] = useState(18)

  const activeRoute = workflow.activeRoute
  const testRoute = activeRoute ?? route
  const locationStop = allStops.find(({ id }) => id === locationStopId) ?? routeStops[0] ?? allStops[0] ?? null
  const arrivalStop = routeStops.find(({ id }) => id === arrivalStopId) ?? routeStops[0] ?? null
  const oppositeStop = locationStop?.opposite
    ? allStops.find(({ id }) => id === locationStop.opposite) ?? null
    : null

  useEffect(() => controller.subscribe(() => setSnapshot(controller.getSnapshot())), [controller])

  useEffect(() => {
    if (!activeRoute && snapshot.driving) controller.pauseDriving()
  }, [activeRoute, controller, snapshot.driving])

  const openPanel = (): void => {
    controller.activate()
    setIsOpen(true)
  }

  const setFakeLocation = (): void => {
    if (!locationStop) return
    controller.setLocation(locationMode, locationStop, offsetMeters)
  }

  const placeBetweenOppositeStops = (): void => {
    if (!locationStop || !oppositeStop) return
    controller.setLocationAtCoordinate(
      locationMode,
      (locationStop.longitude + oppositeStop.longitude) / 2,
      (locationStop.latitude + oppositeStop.latitude) / 2,
    )
  }

  const setFakeArrival = (value: string): void => {
    setArrivalEta(value)
    if (!testRoute || !arrivalStop) return
    const etaSeconds = value === 'none' ? null : Number(value)
    if (arrivalService === 'public') {
      controller.setPublicServiceArrival('95', arrivalStop, etaSeconds)
    } else {
      controller.setArrival(testRoute, arrivalStop, etaSeconds)
    }
  }

  const changeArrivalService = (value: 'internal' | 'public'): void => {
    setArrivalService(value)
    if (arrivalEta === 'none' || !testRoute || !arrivalStop) return
    const etaSeconds = Number(arrivalEta)
    if (value === 'public') {
      controller.setPublicServiceArrival('95', arrivalStop, etaSeconds)
    } else {
      controller.setArrival(testRoute, arrivalStop, etaSeconds)
    }
  }

  const startOrPauseDriving = (): void => {
    if (snapshot.driving) {
      controller.pauseDriving()
      return
    }
    const stops = activeRoute ? workflow.activeStops : routeStops
    const currentIndex = activeRoute
      ? workflow.activeStopIndex ?? 0
      : Math.max(0, routeStops.findIndex(({ id }) => id === workflow.currentStop?.id))
    controller.startDriving(stops, currentIndex, speedMetersPerSecond)
  }

  if (!testRoute) return null

  const driveStops = activeRoute ? workflow.activeStops : routeStops
  const driveIndex = activeRoute ? workflow.activeStopIndex ?? 0 : 0
  const canDrive = Boolean(activeRoute && driveStops.length > 1 && driveIndex < driveStops.length - 1)

  return (
    <div className="route-following-demo">
      <Button
        label={snapshot.active ? 'Test route · Sim on' : 'Test route'}
        ariaLabel={isOpen ? 'Close route test controls' : 'Open route test controls'}
        variant="secondary"
        size="sm"
        expanded={isOpen}
        controls="route-following-demo-panel"
        className="route-following-demo-toggle"
        onClick={() => isOpen ? setIsOpen(false) : openPanel()}
      />

      {isOpen && (
        <section id="route-following-demo-panel" className="route-following-demo-panel" aria-label="Route test simulation">
          <header className="route-following-demo-header">
            <div>
              <strong>DEV SIMULATION</strong>
              <span>{testRoute.id}</span>
            </div>
            <Button
              label="Reset"
              variant="ghost"
              size="sm"
              onClick={() => {
                controller.reset()
                setArrivalEta('none')
              }}
            />
          </header>

          <fieldset className="route-following-demo-section">
            <legend>Location</legend>
            <label>
              Stop
              <select
                aria-label="Simulated location stop"
                value={locationStop?.id ?? ''}
                onChange={(event) => setLocationStopId(event.currentTarget.value)}
              >
                {allStops.map((stop) => <option key={stop.id} value={stop.id}>{getBusStopName(stop)}</option>)}
              </select>
            </label>
            <div className="route-following-demo-control-row">
              <label>
                GPS state
                <select
                  aria-label="Simulated location state"
                  value={locationMode}
                  onChange={(event) => setLocationMode(event.currentTarget.value as RouteFollowingDemoLocationMode)}
                >
                  {LOCATION_MODES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>
                Distance
                <select
                  aria-label="Distance from simulated stop"
                  value={offsetMeters}
                  onChange={(event) => setOffsetMeters(Number(event.currentTarget.value))}
                  disabled={locationMode === 'denied' || locationMode === 'disabled'}
                >
                  <option value={0}>At stop</option>
                  <option value={24}>24 m</option>
                  <option value={26}>26 m</option>
                  <option value={41}>41 m</option>
                </select>
              </label>
            </div>
            <div className="route-following-demo-control-row">
              <Button label="Apply location" size="sm" onClick={setFakeLocation} />
              {oppositeStop && locationMode !== 'denied' && locationMode !== 'disabled' && (
                <Button
                  label="Between opposite stops"
                  variant="ghost"
                  size="sm"
                  onClick={placeBetweenOppositeStops}
                />
              )}
            </div>
          </fieldset>

          <fieldset className="route-following-demo-section">
            <legend>Bus arrival</legend>
            <label>
              At stop
              <select
                aria-label="Simulated arrival stop"
                value={arrivalStop?.id ?? ''}
                onChange={(event) => setArrivalStopId(event.currentTarget.value)}
              >
                {routeStops.map((stop) => <option key={stop.id} value={stop.id}>{getBusStopName(stop)}</option>)}
              </select>
            </label>
            <div className="route-following-demo-control-row">
              <label>
                Service
                <select
                  aria-label="Simulated arrival service type"
                  value={arrivalService}
                  onChange={(event) => changeArrivalService(event.currentTarget.value as 'internal' | 'public')}
                >
                  <option value="internal">Internal {testRoute.id}</option>
                  <option value="public">Public service 95</option>
                </select>
              </label>
              <label>
                Fake ETA
                <select
                  aria-label="Simulated bus ETA"
                  value={arrivalEta}
                  onChange={(event) => setFakeArrival(event.currentTarget.value)}
                >
                  <option value="none">No arrival</option>
                  <option value={120}>2 minutes</option>
                  <option value={60}>1 minute</option>
                  <option value={0}>Arr</option>
                </select>
              </label>
              <Button
                label="Advance 1 min"
                variant="ghost"
                size="sm"
                disabled={!snapshot.active || arrivalEta === 'none'}
                onClick={() => controller.advanceTime(60_000)}
              />
            </div>
          </fieldset>

          <fieldset className="route-following-demo-section">
            <legend>Bus movement</legend>
            <p className="route-following-demo-hint">
              {workflow.currentStop ? `Here: ${getBusStopName(workflow.currentStop)}` : 'Start following with the arrival prompt first.'}
            </p>
            <div className="route-following-demo-control-row">
              <label>
                Speed
                <select
                  aria-label="Simulated bus speed"
                  value={speedMetersPerSecond}
                  onChange={(event) => setSpeedMetersPerSecond(Number(event.currentTarget.value))}
                >
                  <option value={8}>Slow</option>
                  <option value={18}>Normal</option>
                  <option value={45}>Fast</option>
                </select>
              </label>
              <Button
                label={snapshot.driving ? 'Pause bus' : 'Drive bus'}
                size="sm"
                disabled={!canDrive || !snapshot.active}
                onClick={startOrPauseDriving}
              />
            </div>
          </fieldset>
          <p className="route-following-demo-footnote">Fake location and arrival data stay in this dev session.</p>
        </section>
      )}
    </div>
  )
}
