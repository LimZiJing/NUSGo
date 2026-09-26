import type { Ref } from 'react'
import { MOBILE_TABS, type MobileTab } from './mobile-tab'

interface MobileTabBarProps {
  readonly activeTab: MobileTab
  readonly onSelectTab: (tab: MobileTab) => void
  readonly containerRef?: Ref<HTMLElement>
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
          {label}
        </button>
      ))}
    </nav>
  )
}
