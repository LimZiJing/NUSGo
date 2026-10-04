import {
  useEffect,
  useImperativeHandle,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type Ref,
} from 'react'
import { MobileSheetHandle } from './mobile-sheet-handle'
import type { MobileSheetDetent, OpenMobileSheetDetent } from './mobile-sheet-detent'

interface MobileSheetShellProps {
  readonly className: string
  readonly label: string
  readonly controlsId: string
  readonly detent: MobileSheetDetent
  readonly lastNonCollapsedDetent?: OpenMobileSheetDetent
  readonly enabled?: boolean
  readonly onBeforeToggle?: () => void
  readonly onDetentChange: (detent: MobileSheetDetent) => void
  readonly shellRef?: Ref<HTMLElement>
  readonly sectionProps?: Omit<
    ComponentPropsWithoutRef<'section'>,
    'className' | 'children' | 'ref'
  > & {
    readonly [key: `data-${string}`]: string | number | boolean | undefined
  }
  readonly children: ReactNode
}

export function MobileSheetShell({
  className,
  label,
  controlsId,
  detent,
  lastNonCollapsedDetent = 'partial',
  enabled = true,
  onBeforeToggle,
  onDetentChange,
  shellRef,
  sectionProps,
  children,
}: MobileSheetShellProps) {
  const internalShellRef = useRef<HTMLElement>(null)
  const handleRef = useRef<HTMLButtonElement>(null)
  const previousDetentRef = useRef(detent)
  const previousEnabledRef = useRef(enabled)
  const isExpanded = detent !== 'collapsed'

  useEffect(() => {
    const wasExpanded = previousDetentRef.current !== 'collapsed'
    previousDetentRef.current = detent
    if (!enabled || !wasExpanded || detent !== 'collapsed') return

    const content = internalShellRef.current?.querySelector('[data-mobile-sheet-content]')
    if (content?.contains(document.activeElement)) handleRef.current?.focus()
  }, [detent, enabled])

  useEffect(() => {
    const wasEnabled = previousEnabledRef.current
    previousEnabledRef.current = enabled
    if (!wasEnabled || enabled || document.activeElement !== handleRef.current) return

    const content = internalShellRef.current?.querySelector('[data-mobile-sheet-content]')
    const target = content?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
    )
    target?.focus()
  }, [enabled])

  useImperativeHandle(shellRef, () => internalShellRef.current as HTMLElement, [])

  return (
    <section
      {...sectionProps}
      className={className}
      data-mobile-sheet
      data-expanded={isExpanded}
      data-detent={detent}
      ref={internalShellRef}
    >
      {enabled && (
        <div className="mobile-sheet-handle-row">
          <MobileSheetHandle
            detent={detent}
            restoreDetent={lastNonCollapsedDetent}
            label={label}
            controlsId={controlsId}
            onButtonRef={(button) => {
              handleRef.current = button
            }}
            onBeforeClick={onBeforeToggle}
            onDetentChange={onDetentChange}
          />
        </div>
      )}
      {children}
    </section>
  )
}
