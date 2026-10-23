import { useLayoutEffect, useRef } from 'react'
import type { NavigationView } from '../navigation/navigation-state'
import type { NavigationSessionCommands } from '../navigation-session-mount'
import type { MobileSheetDetent } from '../../ui/mobile/mobile-sheet/mobile-sheet-detent'

interface UseStopsEntryRefitOptions {
  readonly commands: Pick<NavigationSessionCommands, 'focusStopInStopsTab'>
  readonly isMobileViewport: boolean
  readonly activeView: NavigationView
  readonly stopsDetent: MobileSheetDetent
  readonly rememberedStopId: string | null
}

/**
 * Refocuses the remembered Stops stop when Stops becomes active or the remembered stop changes.
 * Call it after useMapOverlayLayout so the new insets are already applied.
 * A collapsed mobile Stops sheet leaves the map unobscured, so the camera is left alone.
 */
export function useStopsEntryRefit({
  commands,
  isMobileViewport,
  activeView,
  stopsDetent,
  rememberedStopId,
}: UseStopsEntryRefitOptions): void {
  // Only menu entry and stop changes should refit; other renders read these values through refs.
  const commandsRef = useRef(commands)
  const isMobileViewportRef = useRef(isMobileViewport)
  const stopsDetentRef = useRef(stopsDetent)
  useLayoutEffect(() => {
    commandsRef.current = commands
    isMobileViewportRef.current = isMobileViewport
    stopsDetentRef.current = stopsDetent
  }, [commands, isMobileViewport, stopsDetent])

  useLayoutEffect(() => {
    if (activeView !== 'stops' || rememberedStopId === null) return
    if (isMobileViewportRef.current && stopsDetentRef.current === 'collapsed') return
    commandsRef.current.focusStopInStopsTab(rememberedStopId)
  }, [activeView, rememberedStopId])
}
