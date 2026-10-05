import type { Ref } from 'react'
import { BusIcon, CompassIcon, RouteIcon } from './icons'
import { NAVIGATION_VIEWS, type NavigationView } from './navigation-view'

interface MainNavigationProps {
  readonly activeView: NavigationView
  readonly onSelectView: (view: NavigationView) => void
  readonly containerRef?: Ref<HTMLElement>
}

function NavigationIcon({ view }: { readonly view: NavigationView }) {
  if (view === 'explore') {
    return <CompassIcon />
  }

  if (view === 'stops') {
    return <BusIcon />
  }

  return <RouteIcon />
}

export function MainNavigation({
  activeView,
  onSelectView,
  containerRef,
}: MainNavigationProps) {
  return (
    <nav
      className="main-navigation"
      aria-label="Map views"
      ref={containerRef}
    >
      {NAVIGATION_VIEWS.map(({ id, label, panelId }) => (
        <button
          type="button"
          key={id}
          aria-controls={panelId}
          aria-current={activeView === id ? 'page' : undefined}
          onClick={() => onSelectView(id)}
        >
          <span className="navigation-tab-icon">
            <NavigationIcon view={id} />
          </span>
          <span className="navigation-tab-label">{label}</span>
        </button>
      ))}
    </nav>
  )
}
