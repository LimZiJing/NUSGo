import { useLayoutEffect, useRef } from 'react'
import type { ExploreMode } from '../../features/explore/state/explore-state'
import type { NavigationView } from '../navigation/navigation-state'
import type { NavigationSessionCommands } from '../navigation-session-mount'
import type { MobileSheetDetent } from '../../ui/mobile/mobile-sheet/mobile-sheet-detent'

interface UseExploreEntryRefitOptions {
  readonly commands: Pick<NavigationSessionCommands, 'refitExploreTarget'>
  readonly isMobileViewport: boolean
  readonly activeView: NavigationView
  readonly exploreDetent: MobileSheetDetent
  readonly exploreMode: ExploreMode
  readonly selectedVenueCode: string | null
  readonly selectedBuildingId: string | null
  readonly selectedRouteId: string | null
}

/**
 * Refits the active Explore target (venue or building in venue details, or the selected Route
 * while browsing its stops) when Explore becomes active or that target changes.
 * Call it after useMapOverlayLayout so the new insets are already applied.
 * A collapsed mobile Explore sheet leaves the map unobscured, so the camera is left alone.
 * The pending fit is kept in that case and applied on the next inset report instead.
 */
export function useExploreEntryRefit({
  commands,
  isMobileViewport,
  activeView,
  exploreDetent,
  exploreMode,
  selectedVenueCode,
  selectedBuildingId,
  selectedRouteId,
}: UseExploreEntryRefitOptions): void {
  // Only menu entry and target changes should refit; other renders read these values through refs.
  const commandsRef = useRef(commands)
  const isMobileViewportRef = useRef(isMobileViewport)
  const exploreDetentRef = useRef(exploreDetent)
  useLayoutEffect(() => {
    commandsRef.current = commands
    isMobileViewportRef.current = isMobileViewport
    exploreDetentRef.current = exploreDetent
  }, [commands, isMobileViewport, exploreDetent])

  const hasTarget = exploreMode === 'venue-detail'
    ? selectedVenueCode !== null || selectedBuildingId !== null
    : exploreMode === 'bus-routes' && selectedRouteId !== null

  useLayoutEffect(() => {
    if (activeView !== 'explore' || !hasTarget) return
    if (isMobileViewportRef.current && exploreDetentRef.current === 'collapsed') return
    commandsRef.current.refitExploreTarget()
  }, [activeView, exploreMode, hasTarget, selectedVenueCode, selectedBuildingId, selectedRouteId])
}
