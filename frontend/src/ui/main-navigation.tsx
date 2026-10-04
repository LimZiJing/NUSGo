import type { Ref } from 'react'
import { NAVIGATION_VIEWS, type NavigationView } from './navigation-view'

interface MainNavigationProps {
  readonly activeView: NavigationView
  readonly onSelectView: (view: NavigationView) => void
  readonly containerRef?: Ref<HTMLElement>
}

function NavigationIcon({ view }: { readonly view: NavigationView }) {
  if (view === 'explore') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9.5" />
        <path
          d="m15.6 7.6-2.8 6.1-6.1 2.8 2.8-6.1 6.1-2.8Z"
          fill="currentColor"
          stroke="none"
        />
      </svg>
    )
  }

  if (view === 'stops') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M4 16V8.6A2.6 2.6 0 0 1 6.6 6h6.9a2.5 2.5 0 0 1 2.5 2.5V16H4Z"
          fill="currentColor"
          stroke="none"
        />
        <path d="M5.6 8.1h3.3v3.4H5.6zm4.9 0h3.2v3.4h-3.2z" fill="#fff" stroke="none" />
        <path d="M4.5 12.7H15" stroke="#fff" strokeWidth="1.5" />
        <circle cx="7.1" cy="16.8" r="1.45" fill="#fff" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="13" cy="16.8" r="1.45" fill="#fff" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="18.1" cy="6.3" r="4.15" fill="#fff" />
        <path d="M18.1 4.4v2.1l1.35.85" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 21v-5.5m0 0-6.3-6.3m6.3 6.3 6.3-6.3M12 15.5V4.5" />
      <path d="m3.2 11.2 2.5-2.5 2.5 2.5z" fill="currentColor" stroke="none" />
      <path d="m15.8 11.2 2.5-2.5 2.5 2.5z" fill="currentColor" stroke="none" />
      <path d="m9.5 7 2.5-2.5L14.5 7z" fill="currentColor" stroke="none" />
    </svg>
  )
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
