import { IconButton as AstryxIconButton } from '@astryxdesign/core/IconButton'
import type { ComponentProps, ComponentType, ReactNode } from 'react'
import { joinClassNames } from './class-names'

type AstryxIconButtonWithNativeTitleProps = ComponentProps<typeof AstryxIconButton> & {
  readonly title?: string
}

// Astryx forwards unknown HTML attributes but omits `title` from BaseProps.
// Keep the map controls' existing native title text through that narrow gap.
const AstryxIconButtonWithNativeTitle = AstryxIconButton as ComponentType<AstryxIconButtonWithNativeTitleProps>

export interface MapOverlayIconButtonProps {
  readonly label: string
  readonly title: string
  readonly icon: ReactNode
  readonly onClick: () => void
  readonly className?: string
  readonly expanded?: boolean
  readonly controls?: string
  readonly pressed?: boolean
  readonly busy?: boolean
  readonly ref?: ComponentProps<typeof AstryxIconButton>['ref']
}

export function MapOverlayIconButton({
  label,
  title,
  icon,
  onClick,
  className,
  expanded,
  controls,
  pressed,
  busy,
  ref,
}: MapOverlayIconButtonProps) {
  return (
    <AstryxIconButtonWithNativeTitle
      className={joinClassNames('map-overlay-button', className)}
      label={label}
      title={title}
      icon={icon}
      variant="secondary"
      size="lg"
      aria-expanded={expanded}
      aria-controls={controls}
      aria-pressed={pressed}
      aria-busy={busy === undefined ? undefined : busy ? true : 'false'}
      onClick={onClick}
      ref={ref}
    />
  )
}
