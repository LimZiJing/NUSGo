import { useEffect, useMemo, useRef, useState } from 'react'
import type { BusRoute, TransitStop } from '@nusgo/shared/transit/types'
import { Button, IconButton } from '../../ui/button'
import { BusIcon, MoreHorizontalIcon } from '../../ui/icons'
import { getBusStopName } from '../../domain/transit'
import { RouteFollowingDemoButton } from './route-following-demo-button'
import { RouteStopPicker } from './route-stop-picker'
import type { RouteFollowingWorkflow } from './use-route-following'
import './route-following.css'

type RouteFollowingBarWorkflow = Pick<
  RouteFollowingWorkflow,
  | 'currentStop'
  | 'suggestion'
  | 'pendingRoute'
  | 'pendingRouteSuggestion'
  | 'activeRoute'
  | 'activeStops'
  | 'activeStopIndex'
  | 'announcement'
  | 'announcementRevision'
  | 'setCurrentStop'
  | 'clearCurrentStop'
  | 'confirmSuggestion'
  | 'dismissSuggestion'
  | 'requestFollowRoute'
  | 'startAtStop'
  | 'cancelRouteStart'
  | 'demoFollowRoute'
  | 'stopFollowing'
>

interface RouteFollowingBarProps {
  readonly workflow: RouteFollowingBarWorkflow
  readonly selectedRoute: BusRoute | null
  readonly selectedRouteVisible: boolean
  readonly stops: readonly TransitStop[]
  readonly hidden?: boolean
  readonly showDemo?: boolean
}

const NOTICE_DURATION_MS = 3_000

export function RouteFollowingBar({
  workflow,
  selectedRoute,
  selectedRouteVisible,
  stops,
  hidden = false,
  showDemo = false,
}: RouteFollowingBarProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditingStop, setIsEditingStop] = useState(false)
  const [selectedStop, setSelectedStop] = useState<{ readonly routeId: string | null; readonly stopId: string } | null>(null)
  const [expiredAnnouncementRevision, setExpiredAnnouncementRevision] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const restoreTriggerFocusAfterCancelRef = useRef(false)

  const stopsById = useMemo(() => new Map(stops.map((stop) => [stop.id, stop])), [stops])
  const activeRoute = workflow.activeRoute
  const pendingRoute = workflow.pendingRoute
  const following = activeRoute !== null
  const starting = pendingRoute !== null
  const canFollowSelectedRoute = !following && !starting && selectedRouteVisible && selectedRoute !== null
  const route = activeRoute ?? pendingRoute ?? (selectedRouteVisible ? selectedRoute : null)
  const routeStops = useMemo(() => route
    ? route.stopIds.flatMap((stopId) => {
      const stop = stopsById.get(stopId)
      return stop ? [stop] : []
    })
    : [], [route, stopsById])
  const nearbySuggestion = !following && !starting && !canFollowSelectedRoute
    ? workflow.suggestion
    : null
  const currentStopOnly = !following && !starting && !canFollowSelectedRoute && !nearbySuggestion
    ? workflow.currentStop
    : null
  const currentStop = workflow.currentStop ?? (
    workflow.activeStopIndex === null ? null : workflow.activeStops[workflow.activeStopIndex] ?? null
  )
  const stopOptions = following ? workflow.activeStops : routeStops
  const pickerStops = isEditingStop && !following && (currentStopOnly || canFollowSelectedRoute)
    ? stops
    : stopOptions
  const routeStopIds = new Set(route?.stopIds ?? [])
  const suggestedStopId = workflow.pendingRouteSuggestion?.id
  const currentRouteStopId = workflow.currentStop?.id
  const preferredStopId = suggestedStopId && routeStopIds.has(suggestedStopId)
    ? suggestedStopId
    : currentRouteStopId && routeStopIds.has(currentRouteStopId)
      ? currentRouteStopId
      : routeStops[0]?.id ?? currentStopOnly?.id ?? stops[0]?.id ?? ''
  const selectedStopId = selectedStop !== null
    && selectedStop.routeId === (route?.id ?? null)
    && pickerStops.some((stop) => stop.id === selectedStop.stopId)
    ? selectedStop.stopId
    : preferredStopId
  const showNotice = Boolean(
    workflow.announcement && workflow.announcementRevision > expiredAnnouncementRevision,
  )
  const notice = workflow.announcement.replace(/ · Approx\.$/, '')
  const shouldShow = !hidden && (
    following || starting || canFollowSelectedRoute || nearbySuggestion || currentStopOnly || showNotice
  )
  const panelOpen = isExpanded || starting
  const displayName = currentStop ? getBusStopName(currentStop) : ''
  const routeName = route?.id ?? selectedRoute?.id
  const directionStop = routeStops.at(-1)
  const directionName = directionStop ? getBusStopName(directionStop) : ''
  const directionSuffix = directionName ? ` → ${directionName}` : ''

  useEffect(() => {
    if (!workflow.announcement || workflow.announcementRevision <= expiredAnnouncementRevision) return
    const timeout = window.setTimeout(
      () => setExpiredAnnouncementRevision(workflow.announcementRevision),
      NOTICE_DURATION_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [expiredAnnouncementRevision, workflow.announcement, workflow.announcementRevision])

  useEffect(() => {
    if (workflow.pendingRoute || !restoreTriggerFocusAfterCancelRef.current) return
    restoreTriggerFocusAfterCancelRef.current = false
    triggerRef.current?.focus()
  }, [workflow.pendingRoute])

  if (!shouldShow) return null

  const triggerLabel = following
    ? `${routeName} · ${displayName || 'Current stop'}${directionSuffix}`
    : starting
      ? `Start ${routeName}${directionSuffix}`
      : canFollowSelectedRoute
        ? `Follow ${routeName}${directionSuffix}`
        : nearbySuggestion
          ? `Nearby · ${getBusStopName(nearbySuggestion)}`
          : `Current · ${getBusStopName(currentStopOnly!)}`
  const triggerAccessibleName = following
    ? `Following route ${routeName} toward ${directionName || 'destination'}, current stop ${displayName || 'unknown'}`
    : starting
      ? `Choose a starting stop for route ${routeName} toward ${directionName || 'its destination'}`
      : canFollowSelectedRoute
        ? `Follow route ${routeName} toward ${directionName || 'its destination'}`
        : nearbySuggestion
          ? `Nearby bus stop suggestion: ${getBusStopName(nearbySuggestion)}`
          : `Current stop: ${getBusStopName(currentStopOnly!)}`
  const demoRoute = activeRoute ?? (selectedRouteVisible ? selectedRoute : null)
  const hasRouteOptions = Boolean(currentStop || showDemo)

  const updateSelectedStop = (stopId: string): void => {
    setSelectedStop({ routeId: route?.id ?? null, stopId })
  }

  const toggleExpanded = (): void => setIsExpanded((open) => !open)

  const followSelectedRoute = (): void => {
    if (!selectedRoute) return
    const started = workflow.requestFollowRoute(selectedRoute.id)
    if (started) setIsExpanded(false)
  }

  const startFollowing = (): void => {
    if (!selectedStopId) return
    workflow.startAtStop(selectedStopId)
    setIsExpanded(false)
  }

  const saveCurrentStop = (): void => {
    if (!selectedStopId) return
    workflow.setCurrentStop(selectedStopId)
    setIsEditingStop(false)
    setIsExpanded(false)
  }

  const changeCurrentStop = (): void => {
    updateSelectedStop(currentStop?.id ?? routeStops[0]?.id ?? stops[0]?.id ?? '')
    setIsEditingStop(true)
    setIsExpanded(true)
  }

  const cancelStopEdit = (): void => {
    setIsEditingStop(false)
    setIsExpanded(false)
    triggerRef.current?.focus()
  }

  const cancelRouteStart = (): void => {
    restoreTriggerFocusAfterCancelRef.current = true
    workflow.cancelRouteStart()
    setIsExpanded(false)
  }

  const stopFollowing = (): void => {
    workflow.stopFollowing()
    setIsExpanded(false)
  }

  const clearCurrentStop = (): void => {
    workflow.clearCurrentStop()
    setIsExpanded(false)
  }

  const confirmSuggestion = (): void => {
    workflow.confirmSuggestion()
    setIsExpanded(false)
  }

  const dismissSuggestion = (): void => {
    workflow.dismissSuggestion()
    setIsExpanded(false)
  }

  const demoFollowRoute = (routeId: string): void => {
    workflow.demoFollowRoute(routeId)
    setIsExpanded(false)
  }

  const trigger = canFollowSelectedRoute ? (
    <div className="route-following-island-trigger-row">
      <Button
        ref={triggerRef}
        label={triggerLabel}
        ariaLabel={triggerAccessibleName}
        icon={<BusIcon size={16} />}
        variant="secondary"
        className="route-following-island-main"
        onClick={followSelectedRoute}
      />
      {hasRouteOptions && (
        <IconButton
          label="Route following options"
          icon={<MoreHorizontalIcon size={18} />}
          variant="ghost"
          className="route-following-island-options"
          expanded={panelOpen}
          controls="route-following-island-panel"
          onClick={toggleExpanded}
        />
      )}
    </div>
  ) : (
    <Button
      ref={triggerRef}
      label={triggerLabel}
      ariaLabel={triggerAccessibleName}
      icon={<BusIcon size={16} />}
      trailingIcon={<MoreHorizontalIcon size={16} />}
      variant="secondary"
      className="route-following-island-main"
      expanded={panelOpen}
      controls="route-following-island-panel"
      onClick={starting ? () => setIsExpanded(true) : toggleExpanded}
    />
  )

  return (
    <section
      className="route-following-island"
      data-expanded={panelOpen || showNotice ? 'true' : undefined}
      aria-label="Route following"
    >
      {showNotice && <p className="route-following-island-notice" aria-hidden="true">{notice}</p>}
      {trigger}
      <div id="route-following-island-panel" className="route-following-island-panel" hidden={!panelOpen}>
        {starting && route && (
          <div className="route-following-island-content">
            <RouteStopPicker
              label="Starting stop"
              stops={routeStops}
              value={selectedStopId}
              onChange={updateSelectedStop}
            />
            <div className="route-following-island-actions">
              <Button label="Start" variant="primary" disabled={!selectedStopId} onClick={startFollowing} />
              <Button label="Cancel" variant="ghost" onClick={cancelRouteStart} />
            </div>
          </div>
        )}

        {following && activeRoute && (
          <div className="route-following-island-content">
            {isEditingStop ? (
              <>
                <RouteStopPicker
                  label="Current stop"
                  stops={workflow.activeStops}
                  value={selectedStopId}
                  onChange={updateSelectedStop}
                />
                <div className="route-following-island-actions">
                  <Button label="Save" variant="primary" disabled={!selectedStopId} onClick={saveCurrentStop} />
                  <Button label="Cancel" variant="ghost" onClick={cancelStopEdit} />
                </div>
              </>
            ) : (
              <div className="route-following-island-actions">
                <Button label="Change stop" onClick={changeCurrentStop} />
                <Button label="Stop" variant="ghost" ariaLabel="Stop following" onClick={stopFollowing} />
              </div>
            )}
            {showDemo && demoRoute && (
              <RouteFollowingDemoButton
                route={demoRoute}
                activeRouteId={activeRoute.id}
                activeStopIndex={workflow.activeStopIndex}
                onDemo={demoFollowRoute}
              />
            )}
          </div>
        )}

        {canFollowSelectedRoute && selectedRoute && (
          <div className="route-following-island-content">
            {currentStop && !isEditingStop && (
              <>
                <div className="route-following-island-current-stop">
                  <span>Current stop</span>
                  <strong>{getBusStopName(currentStop)}</strong>
                </div>
                <div className="route-following-island-actions">
                  <Button label="Change stop" onClick={changeCurrentStop} />
                  <Button label="Clear stop" variant="ghost" onClick={clearCurrentStop} />
                </div>
              </>
            )}
            {isEditingStop && (
              <>
                <RouteStopPicker
                  label="Current stop"
                  stops={stops}
                  value={selectedStopId}
                  onChange={updateSelectedStop}
                />
                <div className="route-following-island-actions">
                  <Button label="Save" variant="primary" disabled={!selectedStopId} onClick={saveCurrentStop} />
                  <Button label="Cancel" variant="ghost" onClick={cancelStopEdit} />
                </div>
              </>
            )}
            {showDemo && (
              <RouteFollowingDemoButton
                route={selectedRoute}
                activeRouteId={null}
                activeStopIndex={null}
                onDemo={demoFollowRoute}
              />
            )}
          </div>
        )}

        {nearbySuggestion && (
          <div className="route-following-island-content">
            <p className="route-following-island-current-stop">
              Set <strong>{getBusStopName(nearbySuggestion)}</strong> as current stop?
            </p>
            <div className="route-following-island-actions">
              <Button label="Use stop" variant="primary" onClick={confirmSuggestion} />
              <Button label="Dismiss" variant="ghost" onClick={dismissSuggestion} />
            </div>
          </div>
        )}

        {currentStopOnly && (
          <div className="route-following-island-content">
            {isEditingStop ? (
              <>
                <RouteStopPicker
                  label="Current stop"
                  stops={stops}
                  value={selectedStopId}
                  onChange={updateSelectedStop}
                />
                <div className="route-following-island-actions">
                  <Button label="Save" variant="primary" disabled={!selectedStopId} onClick={saveCurrentStop} />
                  <Button label="Cancel" variant="ghost" onClick={cancelStopEdit} />
                </div>
              </>
            ) : (
              <div className="route-following-island-actions">
                <Button label="Change stop" onClick={changeCurrentStop} />
                <Button label="Clear stop" variant="ghost" onClick={clearCurrentStop} />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
