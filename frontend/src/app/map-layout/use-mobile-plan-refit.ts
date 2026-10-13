import { useLayoutEffect, useRef } from 'react'
import type { NavigationView } from '../navigation/navigation-state'
import type { NavigationSessionCommands } from '../navigation-session-mount'
import type { MobileSheetDetent } from '../../ui/mobile/mobile-sheet/mobile-sheet-detent'

interface UseMobilePlanRefitOptions {
  readonly commands: Pick<NavigationSessionCommands, 'fitJourneyRoutes'>
  readonly isMobileViewport: boolean
  readonly activeView: NavigationView
  readonly planDetent: MobileSheetDetent
  readonly hasJourney: boolean
}

/**
 * Keeps the planned Journey inside the part of the map the Plan sheet leaves visible.
 * Call it after useMapOverlayLayout so the new detent's insets are already applied.
 * A full sheet covers the whole map, so there is nothing to fit.
 */
export function useMobilePlanRefit({
  commands,
  isMobileViewport,
  activeView,
  planDetent,
  hasJourney,
}: UseMobilePlanRefitOptions): void {
  // Planning fits the new Journey itself; only a detent or menu change should refit.
  const hasJourneyRef = useRef(hasJourney)
  const commandsRef = useRef(commands)
  useLayoutEffect(() => {
    hasJourneyRef.current = hasJourney
    commandsRef.current = commands
  }, [commands, hasJourney])

  useLayoutEffect(() => {
    if (!isMobileViewport || activeView !== 'plan' || planDetent === 'full') return
    if (!hasJourneyRef.current) return
    commandsRef.current.fitJourneyRoutes()
  }, [activeView, isMobileViewport, planDetent])
}
