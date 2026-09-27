import type { ComponentPropsWithoutRef } from 'react'

export type ScrollAreaAxis = 'vertical' | 'horizontal' | 'both'

interface ScrollAreaProps extends ComponentPropsWithoutRef<'div'> {
  readonly axis?: ScrollAreaAxis
}

export function ScrollArea({ axis = 'vertical', className, ...props }: ScrollAreaProps) {
  const classes = ['ui-scroll-area', `ui-scroll-area-${axis}`, className]
    .filter(Boolean)
    .join(' ')

  return <div {...props} className={classes} />
}
