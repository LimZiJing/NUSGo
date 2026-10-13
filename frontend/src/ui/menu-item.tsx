import type { ReactNode, Ref } from 'react'
import { joinClassNames } from './class-names'

interface MenuItemProps {
  readonly label: string
  readonly onClick: () => void
  readonly icon?: ReactNode
  readonly disabled?: boolean
  /** Layout only, such as alignment or flex sizing; the look comes from the props and tokens. */
  readonly className?: string
  readonly ref?: Ref<HTMLButtonElement>
}

export function MenuItem({ label, onClick, icon, disabled, className, ref }: MenuItemProps) {
  return (
    <button
      ref={ref}
      className={joinClassNames('menu-item', className)}
      type="button"
      data-hover-filter="none"
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
