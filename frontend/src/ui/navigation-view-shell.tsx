import type { ReactNode } from 'react'

interface NavigationViewShellProps {
  readonly id: string
  readonly active: boolean
  readonly children: ReactNode
}

export function NavigationViewShell({
  id,
  active,
  children,
}: NavigationViewShellProps) {
  return (
    <div
      id={id}
      className="navigation-view"
      hidden={!active}
      inert={!active}
    >
      {children}
    </div>
  )
}
