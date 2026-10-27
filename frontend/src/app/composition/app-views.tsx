import type { ComponentProps, ReactNode, Ref } from 'react'
import { ExploreContent } from '../../features/explore/explore-content.tsx'
import { PlanContent } from '../../features/plan/plan-content.tsx'
import { StopsContent } from '../../features/stops/stops-content.tsx'
import { MainNavigation } from '../../ui/main-navigation'
import { NavigationPanelShell } from '../../ui/navigation-panel-shell'
import { NavigationViewShell } from '../../ui/navigation-view-shell'
import { MorePanelSurface, type MorePanelPage } from '../../ui/more-panel-surface'
import type { MobileSheetDetent, NavigationState } from '../navigation/navigation-state'
import {
  getExploreSheetSummary,
  getPlanSheetSummary,
  getStopsSheetSummary,
} from './mobile-sheet-summary'

interface PanelShellBindings {
  readonly ref: Ref<HTMLElement>
  readonly onDetentChange: (detent: MobileSheetDetent) => void
}

type ExploreContentProps = Omit<ComponentProps<typeof ExploreContent>, 'sheetDetent'>

export interface AppViewsProps {
  readonly isMobileViewport: boolean
  readonly waypointPlacementActive: boolean
  readonly sheetPortalContainer: HTMLElement | null
  readonly navigation: NavigationState
  readonly onSelectView: ComponentProps<typeof MainNavigation>['onSelectView']
  readonly morePanel: {
    readonly open: boolean
    readonly page: MorePanelPage
    readonly detent: MobileSheetDetent
    readonly title: string
    readonly initialFocusRef: Ref<HTMLButtonElement>
    readonly onClose: () => void
    readonly onDetentChange: (detent: MobileSheetDetent) => void
    readonly content: ReactNode
  }
  readonly shells: {
    readonly navigationColumnRef: Ref<HTMLElement>
    readonly mainNavigationRef: Ref<HTMLElement>
    readonly plan: PanelShellBindings
    readonly explore: PanelShellBindings
    readonly stops: PanelShellBindings
  }
  readonly views: {
    readonly plan: ComponentProps<typeof PlanContent>
    readonly explore: ExploreContentProps
    readonly stops: ComponentProps<typeof StopsContent>
  }
}

export function AppViews({
  isMobileViewport,
  waypointPlacementActive,
  sheetPortalContainer,
  navigation,
  onSelectView,
  morePanel,
  shells: {
    navigationColumnRef,
    mainNavigationRef,
    plan: {
      ref: planSheetRef,
      onDetentChange: onPlanDetentChange,
    },
    explore: {
      ref: exploreSheetRef,
      onDetentChange: onExploreDetentChange,
    },
    stops: {
      ref: stopsSheetRef,
      onDetentChange: onStopsDetentChange,
    },
  },
  views,
}: AppViewsProps) {
  const selectedRoute = views.explore.transitIndex?.routes
    .find((route) => route.id === views.explore.selectedRouteId) ?? null

  return (
    <aside
      className="map-overlay-right navigation-column"
      hidden={waypointPlacementActive}
      ref={navigationColumnRef}
    >
      <div className="navigation-view-stack">
        <NavigationViewShell id="plan-panel" active={!morePanel.open && !waypointPlacementActive && navigation.activeView === 'plan'}>
          <NavigationPanelShell
            className="plan-sheet"
            label="Plan trip panel"
            summary={getPlanSheetSummary(views.plan.tripRequest, views.plan.path)}
            controlsId="plan-content-panel"
            detent={isMobileViewport ? navigation.sheets.plan.detent : 'partial'}
            enabled={isMobileViewport}
            active={!morePanel.open && !waypointPlacementActive && navigation.activeView === 'plan'}
            portalContainer={sheetPortalContainer}
            onDetentChange={onPlanDetentChange}
            sectionProps={{ 'aria-label': 'Trip endpoints' }}
            shellRef={planSheetRef}
          >
            <PlanContent {...views.plan} />
          </NavigationPanelShell>
        </NavigationViewShell>
        <NavigationViewShell id="explore-panel" active={!morePanel.open && !waypointPlacementActive && navigation.activeView === 'explore'}>
          <NavigationPanelShell
            className="explore-sheet"
            label="Explore panel"
            summary={getExploreSheetSummary(
              views.explore.state,
              selectedRoute,
              views.explore.state.selectedBuildingId
                ? views.explore.buildings?.byId.get(views.explore.state.selectedBuildingId)?.name
                : undefined,
            )}
            controlsId="explore-content-panel"
            detent={isMobileViewport ? navigation.sheets.explore.detent : 'partial'}
            enabled={isMobileViewport}
            active={!morePanel.open && !waypointPlacementActive && navigation.activeView === 'explore'}
            portalContainer={sheetPortalContainer}
            onDetentChange={onExploreDetentChange}
            sectionProps={{ 'aria-labelledby': 'explore-content-heading' }}
            shellRef={exploreSheetRef}
          >
            <ExploreContent
              {...views.explore}
              sheetDetent={isMobileViewport ? navigation.sheets.explore.detent : 'partial'}
            />
          </NavigationPanelShell>
        </NavigationViewShell>
        <NavigationViewShell id="stops-panel" active={!morePanel.open && !waypointPlacementActive && navigation.activeView === 'stops'}>
          <NavigationPanelShell
            className="stops-sheet"
            label="Stops panel"
            summary={getStopsSheetSummary(views.stops)}
            controlsId="stops-content"
            detent={isMobileViewport ? navigation.sheets.stops.detent : 'partial'}
            enabled={isMobileViewport}
            active={!morePanel.open && !waypointPlacementActive && navigation.activeView === 'stops'}
            portalContainer={sheetPortalContainer}
            onDetentChange={onStopsDetentChange}
            sectionProps={{ 'aria-label': 'Stops' }}
            shellRef={stopsSheetRef}
          >
            <StopsContent {...views.stops} />
          </NavigationPanelShell>
        </NavigationViewShell>
        <NavigationViewShell id="more-panel" active={morePanel.open}>
          <NavigationPanelShell
            className="more-panel-surface"
            label="More panel"
            controlsId="more-panel-content"
            detent={isMobileViewport ? morePanel.detent : 'partial'}
            partialVisibleHeight={morePanel.page === 'menu' ? 192 : undefined}
            enabled={isMobileViewport}
            active={morePanel.open}
            portalContainer={sheetPortalContainer}
            onDetentChange={morePanel.onDetentChange}
            sectionProps={{
              id: 'more-panel-content',
              'aria-labelledby': 'more-panel-heading',
              'data-open': morePanel.open ? 'true' : 'false',
              'data-page': morePanel.page,
            }}
          >
            <MorePanelSurface
              page={morePanel.page}
              title={morePanel.title}
              initialFocusRef={morePanel.initialFocusRef}
              onClose={morePanel.onClose}
            >
              {morePanel.content}
            </MorePanelSurface>
          </NavigationPanelShell>
        </NavigationViewShell>
      </div>
      {!waypointPlacementActive && <MainNavigation
        activeView={navigation.activeView}
        onSelectView={onSelectView}
        containerRef={mainNavigationRef}
      />}
    </aside>
  )
}
