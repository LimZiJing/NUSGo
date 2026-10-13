import type { ReactNode } from 'react'

export interface SegmentedControlOption<Value extends string> {
  readonly value: Value
  readonly label: ReactNode
  readonly focusId?: string
}

export interface SegmentedControlProps<Value extends string> {
  readonly label: string
  readonly options: readonly SegmentedControlOption<Value>[]
  readonly value: Value
  readonly onValueChange: (value: Value) => void
  readonly className?: string
}

export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onValueChange,
  className,
}: SegmentedControlProps<Value>) {
  return (
    <div
      className={['segmented-control', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option.value}
          className="segmented-control-option"
          type="button"
          data-focus-id={option.focusId}
          aria-pressed={value === option.value}
          onClick={() => onValueChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
