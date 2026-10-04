import type { ReactNode } from 'react'

interface DesktopColumnShellProps {
  readonly id: string
  readonly active: boolean
  readonly children: ReactNode
}

export function DesktopColumnShell({
  id,
  active,
  children,
}: DesktopColumnShellProps) {
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
