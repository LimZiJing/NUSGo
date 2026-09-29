import type { Ref } from 'react'
import { MOBILE_TABS, type MobileTab } from './mobile-tab'

interface MobileTabBarProps {
  readonly activeTab: MobileTab
  readonly onSelectTab: (tab: MobileTab) => void
  readonly containerRef?: Ref<HTMLElement>
}

function MobileTabIcon({ tab }: { readonly tab: MobileTab }) {
  if (tab === 'explore') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" />
        <path d="m15.5 8.5-2.7 6.1-6.1 2.7 2.7-6.1 6.1-2.7Z" />
      </svg>
    )
  }

  if (tab === 'stops') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 16.5V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v8.5H4Z" />
        <path d="M4 11h14M7 16.5v2m8-2v2M7.5 8h3m3 0h1" />
        <circle cx="7.5" cy="13.8" r=".8" />
        <circle cx="14.5" cy="13.8" r=".8" />
        <circle cx="18.5" cy="6" r="4" />
        <path d="M18.5 4v2l1.3.8" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 21v-6m0 0-6-6m6 6 6-6m-6 6V4" />
      <path d="m4 7 2-2 2 2m8 0 2-2 2 2m-8-5 2 2-2 2" />
    </svg>
  )
}

export function MobileTabBar({
  activeTab,
  onSelectTab,
  containerRef,
}: MobileTabBarProps) {
  return (
    <nav className="mobile-tab-bar" aria-label="Map views" ref={containerRef}>
      {MOBILE_TABS.map(({ id, label, panelId }) => (
        <button
          type="button"
          key={id}
          aria-controls={panelId}
          aria-current={activeTab === id ? 'page' : undefined}
          onClick={() => onSelectTab(id)}
        >
          <span className="mobile-tab-icon">
            <MobileTabIcon tab={id} />
          </span>
          <span className="mobile-tab-label">{label}</span>
        </button>
      ))}
    </nav>
  )
}
