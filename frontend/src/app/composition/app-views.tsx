import type { ComponentProps, Ref } from 'react'
import { ExploreRouteBrowser } from '../../features/explore-view/explore-route-browser'
import { ExploreView } from '../../features/explore-view/explore-view'
import { PlanView } from '../../features/plan-view/plan-view'
import { StopsView } from '../../features/stops-view/stops-view'
import { MainNavigation } from '../../ui/main-navigation'
import { MobileSheetShell } from '../../ui/mobile-sheet-shell'
import { NavigationViewShell } from '../../ui/navigation-view-shell'
import type { MobileSheetDetent, NavigationState } from '../navigation/navigation-state'

interface PanelShellBindings {
  readonly ref: Ref<HTMLElement>
  readonly onBeforeToggle: () => void
  readonly onDetentChange: (detent: MobileSheetDetent) => void
}

type ExploreViewProps = Omit<
  ComponentProps<typeof ExploreView>,
  'active' | 'mobileSheet' | 'renderShuttleRoutes' | 'sheetDetent'
>

export interface AppViewsProps {
  readonly isMobileViewport: boolean
  readonly navigation: NavigationState
  readonly onSelectView: ComponentProps<typeof MainNavigation>['onSelectView']
  readonly shells: {
    readonly navigationColumnRef: Ref<HTMLElement>
    readonly mainNavigationRef: Ref<HTMLElement>
    readonly plan: PanelShellBindings
    readonly explore: PanelShellBindings
    readonly stops: PanelShellBindings
  }
  readonly views: {
    readonly plan: ComponentProps<typeof PlanView>
    readonly explore: ExploreViewProps
    readonly exploreRoutes: Pick<
      ComponentProps<typeof ExploreRouteBrowser>,
      'onRouteSelect'
    >
    readonly stops: ComponentProps<typeof StopsView>
  }
}

export function AppViews({
  isMobileViewport,
  navigation,
  onSelectView,
  shells: {
    navigationColumnRef,
    mainNavigationRef,
    plan: {
      ref: planSheetRef,
      onBeforeToggle: onBeforePlanToggle,
      onDetentChange: onPlanDetentChange,
    },
    explore: {
      ref: exploreSheetRef,
      onBeforeToggle: onBeforeExploreToggle,
      onDetentChange: onExploreDetentChange,
    },
    stops: {
      ref: stopsSheetRef,
      onBeforeToggle: onBeforeStopsToggle,
      onDetentChange: onStopsDetentChange,
    },
  },
  views,
}: AppViewsProps) {
  return (
    <aside
      className="map-overlay-right navigation-column"
      ref={navigationColumnRef}
    >
      <div className="navigation-view-stack">
        <NavigationViewShell id="plan-panel" active={navigation.activeView === 'plan'}>
          <MobileSheetShell
            className="plan-sheet"
            label="Plan trip panel"
            controlsId="plan-view-content"
            detent={isMobileViewport ? navigation.sheets.plan.detent : 'partial'}
            lastNonCollapsedDetent={navigation.sheets.plan.lastNonCollapsedDetent}
            enabled={isMobileViewport}
            onBeforeToggle={onBeforePlanToggle}
            onDetentChange={onPlanDetentChange}
            sectionProps={{ 'aria-label': 'Trip endpoints' }}
            shellRef={planSheetRef}
          >
            <PlanView {...views.plan} />
          </MobileSheetShell>
        </NavigationViewShell>
        <NavigationViewShell id="explore-panel" active={navigation.activeView === 'explore'}>
          <MobileSheetShell
            className="explore-sheet"
            label="Explore panel"
            controlsId="explore-view-content"
            detent={isMobileViewport ? navigation.sheets.explore.detent : 'partial'}
            lastNonCollapsedDetent={navigation.sheets.explore.lastNonCollapsedDetent}
            enabled={isMobileViewport}
            onBeforeToggle={onBeforeExploreToggle}
            onDetentChange={onExploreDetentChange}
            sectionProps={{ 'aria-labelledby': 'explore-view-heading' }}
            shellRef={exploreSheetRef}
          >
            <ExploreView
              {...views.explore}
              sheetDetent={isMobileViewport ? navigation.sheets.explore.detent : 'partial'}
              mobileSheet={isMobileViewport}
              active={navigation.activeView === 'explore'}
              renderShuttleRoutes={(options) => (
                <ExploreRouteBrowser
                  network={views.explore.transitIndex?.network ?? null}
                  networkIndex={views.explore.transitIndex ?? null}
                  selectedRouteId={views.explore.selectedRouteId ?? null}
                  onRouteSelect={views.exploreRoutes.onRouteSelect}
                  firstRouteCardRef={options.firstRouteCardRef}
                  onFocusStop={options.onFocusStop}
                />
              )}
            />
          </MobileSheetShell>
        </NavigationViewShell>
        <NavigationViewShell id="stops-panel" active={navigation.activeView === 'stops'}>
          <MobileSheetShell
            className="stops-sheet"
            label="Stops panel"
            controlsId="stops-view-content"
            detent={isMobileViewport ? navigation.sheets.stops.detent : 'partial'}
            lastNonCollapsedDetent={navigation.sheets.stops.lastNonCollapsedDetent}
            enabled={isMobileViewport}
            onBeforeToggle={onBeforeStopsToggle}
            onDetentChange={onStopsDetentChange}
            sectionProps={{ 'aria-label': 'Stops' }}
            shellRef={stopsSheetRef}
          >
            <StopsView {...views.stops} />
          </MobileSheetShell>
        </NavigationViewShell>
      </div>
      <MainNavigation
        activeView={navigation.activeView}
        onSelectView={onSelectView}
        containerRef={mainNavigationRef}
      />
    </aside>
  )
}
