import { forwardRef, type ComponentPropsWithoutRef } from 'react'

export type ScrollAreaAxis = 'vertical' | 'horizontal' | 'both'

interface ScrollAreaProps extends ComponentPropsWithoutRef<'div'> {
  readonly axis?: ScrollAreaAxis
}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { axis = 'vertical', className, ...props },
  ref,
) {
  const classes = ['ui-scroll-area', `ui-scroll-area-${axis}`, className]
    .filter(Boolean)
    .join(' ')

  return <div ref={ref} {...props} className={classes} />
})
