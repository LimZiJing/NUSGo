import { useEffect, useRef, useState } from 'react'
import type { BusRoute } from '@nusgo/shared/transit/types'
import { Button, IconButton } from '../../ui/button'
import { BusIcon, CheckIcon, CloseIcon, MoreHorizontalIcon } from '../../ui/icons'
import { getBusStopName } from '../../domain/transit'
import { RouteBadge } from '../../ui/route-chip'
import { RouteFollowingDemoButton } from './route-following-demo-button'
import type { RouteFollowingWorkflow } from './use-route-following'
import './route-following.css'

const PUSH_NOTIFICATION_DURATION_MS = 15_000

type RouteFollowingBarWorkflow = Pick<
  RouteFollowingWorkflow,
  | 'currentStop'
  | 'suggestion'
  | 'arrivalPrompt'
  | 'activeRoute'
  | 'activeStops'
  | 'activeStopIndex'
  | 'confirmSuggestion'
  | 'dismissSuggestion'
  | 'followArrivalRoute'
  | 'dismissArrivalPrompt'
  | 'demoFollowRoute'
  | 'stopFollowing'
>

interface RouteFollowingBarProps {
  readonly workflow: RouteFollowingBarWorkflow
  readonly selectedRoute: BusRoute | null
  readonly selectedRouteVisible: boolean
  readonly hidden?: boolean
  readonly showDemo?: boolean
}

export function RouteFollowingBar({
  workflow,
  selectedRoute,
  selectedRouteVisible,
  hidden = false,
  showDemo = false,
}: RouteFollowingBarProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const workflowRef = useRef(workflow)
  const activeRoute = workflow.activeRoute
  const following = activeRoute !== null
  const currentStop = workflow.currentStop ?? (
    workflow.activeStopIndex === null ? null : workflow.activeStops[workflow.activeStopIndex] ?? null
  )
  const displayName = currentStop ? getBusStopName(currentStop) : ''
  const showIsland = !hidden && following
  const showPrompt = !hidden && (workflow.suggestion !== null || workflow.arrivalPrompt !== null)
  const promptKind = workflow.suggestion ? 'stop' : workflow.arrivalPrompt ? 'arrival' : null
  const promptKey = workflow.suggestion
    ? `stop:${workflow.suggestion.id}`
    : workflow.arrivalPrompt
      ? `arrival:${workflow.arrivalPrompt.route.id}:${workflow.arrivalPrompt.stop.id}:${workflow.arrivalPrompt.createdAtMs ?? ''}`
      : null
  const showDemoFallback = !hidden && showDemo &&
    !following && selectedRouteVisible && selectedRoute !== null
  const panelOpen = showIsland && isExpanded

  useEffect(() => {
    workflowRef.current = workflow
  }, [workflow])

  useEffect(() => {
    if (hidden || !promptKey || !promptKind) return
    const timeout = window.setTimeout(() => {
      if (promptKind === 'stop') workflowRef.current.dismissSuggestion()
      else workflowRef.current.dismissArrivalPrompt()
    }, PUSH_NOTIFICATION_DURATION_MS)
    return () => window.clearTimeout(timeout)
  }, [hidden, promptKey, promptKind])

  if (!showIsland && !showPrompt && !showDemoFallback) return null

  const routePill = activeRoute?.color
    ? <RouteBadge routeId={activeRoute.id} routeColor={activeRoute.color} ariaHidden />
    : <BusIcon size={16} />

  return (
    <div className="route-following-stack">
      {showPrompt && workflow.suggestion && (
        <div className="route-following-prompt" role="status" aria-live="polite">
          <p>Are you at <strong>{getBusStopName(workflow.suggestion)}</strong>?</p>
          <div className="route-following-prompt-actions">
            <IconButton
              className="route-following-prompt-confirm"
              label={`Confirm ${getBusStopName(workflow.suggestion)}`}
              icon={<CheckIcon size={18} />}
              onClick={workflow.confirmSuggestion}
            />
            <IconButton
              className="route-following-prompt-dismiss"
              label={`Not ${getBusStopName(workflow.suggestion)}`}
              icon={<CloseIcon size={18} />}
              onClick={workflow.dismissSuggestion}
            />
          </div>
        </div>
      )}

      {showPrompt && !workflow.suggestion && workflow.arrivalPrompt && (
        <div className="route-following-prompt route-following-arrival-prompt" role="status" aria-live="polite">
          <p>
            <RouteBadge
              routeId={workflow.arrivalPrompt.route.id}
              routeColor={workflow.arrivalPrompt.route.color}
              ariaHidden
            />
            <span>arrived. Follow?</span>
          </p>
          <div className="route-following-prompt-actions">
            <IconButton
              className="route-following-prompt-confirm route-following-arrival-accept"
              label={`Follow route ${workflow.arrivalPrompt.route.id}`}
              icon={<CheckIcon size={18} />}
              onClick={() => workflow.followArrivalRoute()}
            />
            <IconButton
              className="route-following-prompt-dismiss route-following-arrival-dismiss"
              label={`Do not follow route ${workflow.arrivalPrompt.route.id}`}
              icon={<CloseIcon size={18} />}
              onClick={workflow.dismissArrivalPrompt}
            />
          </div>
        </div>
      )}

      {showDemoFallback && selectedRoute && (
        <div className="route-following-dev-demo-controls" aria-label="Route following test controls">
          <RouteFollowingDemoButton
            route={selectedRoute}
            activeRouteId={null}
            activeStopIndex={null}
            onDemo={workflow.demoFollowRoute}
          />
        </div>
      )}

      {showIsland && activeRoute && (
        <section
          className="route-following-island"
          data-expanded={panelOpen ? 'true' : undefined}
          aria-label="Route following"
        >
          <Button
            label={displayName || 'Following'}
            ariaLabel={`Following route ${activeRoute.id}, current stop ${displayName || 'unknown'}`}
            icon={routePill}
            trailingIcon={<MoreHorizontalIcon size={16} />}
            variant="secondary"
            className="route-following-island-main"
            expanded={panelOpen}
            controls="route-following-island-panel"
            onClick={() => setIsExpanded((open) => !open)}
          />

          <div id="route-following-island-panel" className="route-following-island-panel" hidden={!panelOpen}>
            <div className="route-following-island-actions">
              <Button
                label="Get off"
                ariaLabel="Get off and stop following route"
                variant="secondary"
                size="sm"
                className="route-following-get-off"
                onClick={() => {
                  workflow.stopFollowing()
                  setIsExpanded(false)
                }}
              />
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
