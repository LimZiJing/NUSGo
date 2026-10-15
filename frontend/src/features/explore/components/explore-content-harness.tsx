import type { ComponentProps } from 'react'
import type { MobileSheetDetent } from '../../../ui/mobile/mobile-sheet/mobile-sheet-detent'
import {
  useExplorePanelFocus,
  type ExplorePanelFocusOptions,
} from '../hooks/use-explore-panel-focus'
import { ExploreContent } from '../explore-content.tsx'

type ExplorePanelCallbacks = Partial<Pick<
  ExplorePanelFocusOptions,
  | 'onVenueSelect'
  | 'onBuildingSelect'
  | 'onOpenBusRoutes'
  | 'onLeaveMobileRoutes'
  | 'onFocusStop'
  | 'onBack'
  | 'onEscape'
  | 'onMinimize'
  | 'onDismissMapPopup'
  | 'onSearchCancel'
  | 'onSearchResult'
>>

type ExploreContentHarnessProps = Omit<ComponentProps<typeof ExploreContent>, 'focus' | 'sheetDetent'>
  & ExplorePanelCallbacks
  & {
    readonly active?: boolean
    readonly mobileSheet?: boolean
    readonly sheetDetent?: MobileSheetDetent
  }

// Exercise the focus hook alongside the renderer, as App does in production.
export function ExploreContentHarness({
  state,
  selectedRouteId = null,
  active = true,
  mobileSheet = true,
  sheetDetent = 'partial',
  onVenueSelect = () => undefined,
  onBuildingSelect,
  onOpenBusRoutes = () => undefined,
  onBack = () => undefined,
  onEscape = () => undefined,
  onLeaveMobileRoutes,
  onFocusStop,
  onMinimize,
  onDismissMapPopup,
  onSearchCancel,
  onSearchResult,
  ...contentProps
}: ExploreContentHarnessProps) {
  const focus = useExplorePanelFocus({
    state,
    selectedRouteId,
    sheetDetent,
    mobileSheet,
    active,
    busRoutesAvailable: (contentProps.transitIndex?.routes.length ?? 0) > 0,
    onVenueSelect,
    onBuildingSelect,
    onOpenBusRoutes,
    onLeaveMobileRoutes,
    onFocusStop,
    onBack,
    onEscape,
    onMinimize,
    onDismissMapPopup,
    onSearchCancel,
    onSearchResult,
  })

  return (
    <ExploreContent
      {...contentProps}
      state={state}
      selectedRouteId={selectedRouteId}
      sheetDetent={sheetDetent}
      focus={focus}
    />
  )
}
