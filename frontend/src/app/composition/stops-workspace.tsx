import { forwardRef, memo, useImperativeHandle, useLayoutEffect, useMemo, type Ref } from 'react'
import type { LocationTrackingState } from '../../domain/location/types'
import type { TransitIndex } from '../../domain/transit'
import type { MinuteFormat } from '../../domain/trip/minute-format'
import type { PublicBusArrivalSnapshot } from '../../domain/transit/public-bus-arrivals'
import type { ShuttleArrivalSnapshot } from '../../domain/transit/arrivals'
import type { PushNotificationService } from '../../domain/push/push-notifications'
import type { StopsArrivalLoader } from '../../features/stops/hooks/use-stops-arrivals'
import type { StopsServiceWindowsLoader } from '../../features/stops/hooks/use-stops-service-windows'
import { useAlightReminder } from '../../features/stops/hooks/use-alight-reminder'
import { useStopsWorkflow } from '../../features/stops/hooks/use-stops-workflow'
import type { StopsWorkflow } from '../../features/stops/hooks/use-stops-workflow'
import { StopsContent } from '../../features/stops/stops-content'
import { NavigationPanelShell } from '../../ui/navigation-panel-shell'
import type { MobileSheetDetent } from '../navigation/navigation-state'
import { getStopsSheetSummary } from './mobile-sheet-summary'

export interface StopsWorkspaceController {
  readonly focusStop: StopsWorkflow['focusStop']
  readonly reorderFavorite: StopsWorkflow['reorderFavorite']
  readonly removeFavorite: StopsWorkflow['removeFavorite']
  readonly clearFavoriteStops: StopsWorkflow['clearFavoriteStops']
}

export interface StopsWorkspaceState {
  readonly focusedStopId: string | null
  readonly favoriteStops: StopsWorkflow['favoriteStops']
  readonly selectedStopList: StopsWorkflow['state']['list']
}

interface StopsWorkspaceProps {
  readonly minuteFormat: MinuteFormat
  readonly transitIndex: TransitIndex | null
  readonly mapCenter: { readonly longitude: number; readonly latitude: number } | null
  readonly location: LocationTrackingState
  readonly active: boolean
  readonly panelActive: boolean
  readonly isMobileViewport: boolean
  readonly detent: MobileSheetDetent
  readonly portalContainer: HTMLElement | null
  readonly shellRef: Ref<HTMLElement>
  readonly onDetentChange: (detent: MobileSheetDetent) => void
  readonly loadArrivals: StopsArrivalLoader<ShuttleArrivalSnapshot>
  readonly loadPublicArrivals: StopsArrivalLoader<PublicBusArrivalSnapshot>
  readonly loadServiceWindows: StopsServiceWindowsLoader
  /** Push capability from app composition; reminders are opt-in and never turn on location. */
  readonly pushNotifications: PushNotificationService
  readonly requestLocation: (() => void) | null
  readonly locateFromControl: () => void
  readonly enableLocationTracking: () => void
  readonly onStateChange: (state: StopsWorkspaceState) => void
  readonly onNearbyHighlightChange: (stopIds: StopsWorkflow['nearbyHighlightStopIds']) => void
  readonly backLabel: string
  readonly onBackToStops: (backToStops: () => void) => void
  readonly onSelectOppositeStop: (stopId: string) => void
  readonly onSelectRoute: (routeId: string, stopId: string) => void
  readonly onNavigateToStop: (stopId: string) => void
}

const StopsWorkspaceView = forwardRef<StopsWorkspaceController, StopsWorkspaceProps>(function StopsWorkspaceView({
  minuteFormat,
  transitIndex,
  mapCenter,
  location,
  active,
  panelActive,
  isMobileViewport,
  detent,
  portalContainer,
  shellRef,
  onDetentChange,
  loadArrivals,
  loadPublicArrivals,
  loadServiceWindows,
  pushNotifications,
  requestLocation,
  locateFromControl,
  enableLocationTracking,
  onStateChange,
  onNearbyHighlightChange,
  backLabel,
  onBackToStops,
  onSelectOppositeStop,
  onSelectRoute,
  onNavigateToStop,
}, controllerRef) {
  const workflow = useStopsWorkflow({
    minuteFormat,
    transitIndex,
    mapCenter,
    location,
    active,
    loadArrivals,
    loadPublicArrivals,
    loadServiceWindows,
    requestLocation,
    locateFromControl,
    enableLocationTracking,
  })

  useImperativeHandle(controllerRef, () => ({
    focusStop: workflow.focusStop,
    reorderFavorite: workflow.reorderFavorite,
    removeFavorite: workflow.removeFavorite,
    clearFavoriteStops: workflow.clearFavoriteStops,
  }), [
    workflow.clearFavoriteStops,
    workflow.focusStop,
    workflow.removeFavorite,
    workflow.reorderFavorite,
  ])

  const focusedStopId = workflow.state.focusedStopId
  const reminder = useAlightReminder(pushNotifications, focusedStopId)
  const selectedStopList = workflow.state.list
  const stopListCount = workflow.stopListEntries.length
  const selectedStopName = workflow.selectedStop?.longName ?? null
  const summary = useMemo(() => getStopsSheetSummary({
    selectedStop: selectedStopName ? { longName: selectedStopName } : null,
    stopListCount,
    stopListLoading: workflow.stopListLoading,
    selectedStopList,
  }), [selectedStopName, selectedStopList, stopListCount, workflow.stopListLoading])
  const state = useMemo<StopsWorkspaceState>(() => ({
    focusedStopId,
    favoriteStops: workflow.favoriteStops,
    selectedStopList,
  }), [focusedStopId, selectedStopList, workflow.favoriteStops])

  useLayoutEffect(() => {
    onStateChange(state)
  }, [onStateChange, state])

  useLayoutEffect(() => {
    onNearbyHighlightChange(workflow.nearbyHighlightStopIds)
  }, [onNearbyHighlightChange, workflow.nearbyHighlightStopIds])

  return (
    <NavigationPanelShell
      className="stops-sheet"
      label="Stops panel"
      summary={summary}
      controlsId="stops-content"
      detent={isMobileViewport ? detent : 'partial'}
      enabled={isMobileViewport}
      active={panelActive}
      portalContainer={portalContainer}
      onDetentChange={onDetentChange}
      sectionProps={{ 'aria-label': 'Stops' }}
      shellRef={shellRef}
    >
      <StopsContent
        selectedStop={workflow.selectedStop}
        reminder={reminder}
        backLabel={backLabel}
        onBackToStops={() => onBackToStops(workflow.backToStops)}
        onSelectOppositeStop={onSelectOppositeStop}
        onSelectRoute={onSelectRoute}
        onNavigateToStop={onNavigateToStop}
        stopListEntries={workflow.stopListEntries}
        stopListLoading={workflow.stopListLoading}
        selectedStopList={selectedStopList}
        selectedStopFavorite={workflow.selectedStopFavorite}
        locationNotice={workflow.locationNotice}
        noLiveData={workflow.noLiveData}
        liveArrivalMessage={workflow.liveArrivalMessage}
        isMobileViewport={isMobileViewport}
        onSelectStopList={workflow.selectStopList}
        onToggleFavorite={workflow.toggleFavorite}
        onToggleExpanded={workflow.toggleExpanded}
        onDismissLocationNotice={workflow.dismissLocationNotice}
      />
    </NavigationPanelShell>
  )
})

export const StopsWorkspace = memo(StopsWorkspaceView)
