import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type Ref,
} from 'react'
import { MobileSheet } from './mobile/mobile-sheet/mobile-sheet'
import type { MobileSheetDetent } from './mobile/mobile-sheet/mobile-sheet-detent'

interface NavigationPanelShellProps {
  readonly className: string
  readonly label: string
  readonly summary?: string
  readonly controlsId: string
  readonly detent: MobileSheetDetent
  readonly enabled?: boolean
  readonly active?: boolean
  readonly portalContainer?: HTMLElement | null
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

export function NavigationPanelShell({
  className,
  label,
  summary,
  controlsId,
  detent,
  enabled = true,
  active = true,
  portalContainer,
  onDetentChange,
  shellRef,
  sectionProps,
  children,
}: NavigationPanelShellProps) {
  const internalShellRef = useRef<HTMLElement>(null)
  const handleRef = useRef<HTMLButtonElement>(null)
  const previousDetentRef = useRef(detent)
  const previousEnabledRef = useRef(enabled)
  const assignHandleRef = useCallback((button: HTMLButtonElement | null): void => {
    handleRef.current = button
  }, [])
  const assignPanelRef = useCallback((panel: HTMLElement | null): void => {
    internalShellRef.current = panel
  }, [])

  useEffect(() => {
    const wasExpanded = previousDetentRef.current !== 'collapsed'
    previousDetentRef.current = detent
    if (!enabled || !wasExpanded || detent !== 'collapsed') return

    const content = internalShellRef.current?.querySelector('.navigation-panel-content')
    if (content?.contains(document.activeElement)) handleRef.current?.focus()
  }, [detent, enabled])

  useEffect(() => {
    const wasEnabled = previousEnabledRef.current
    previousEnabledRef.current = enabled
    if (!wasEnabled || enabled || document.activeElement !== handleRef.current) return

    const content = internalShellRef.current?.querySelector('.navigation-panel-content')
    const target = content?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
    )
    target?.focus()
  }, [enabled])

  useImperativeHandle(shellRef, () => internalShellRef.current as HTMLElement)

  if (enabled) {
    return (
      <MobileSheet
        className={className}
        label={label}
        summary={summary}
        controlsId={controlsId}
        active={active}
        portalContainer={portalContainer ?? null}
        detent={detent}
        onDetentChange={onDetentChange}
        onButtonRef={assignHandleRef}
        onPanelRef={assignPanelRef}
        panelProps={sectionProps}
      >
        {children}
      </MobileSheet>
    )
  }

  return (
    <section
      {...sectionProps}
      className={`navigation-panel ${className}`}
      data-mobile-sheet
      data-detent={detent}
      ref={assignPanelRef}
    >
      {children}
    </section>
  )
}
