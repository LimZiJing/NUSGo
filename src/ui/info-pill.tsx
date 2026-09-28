export type InfoPillColorScheme = 'neutral' | 'success'

interface InfoPillProps {
  readonly text: string
  readonly colorScheme: InfoPillColorScheme
  readonly className?: string
  readonly leadingDot?: boolean
}

export function InfoPill({ text, colorScheme, className, leadingDot = false }: InfoPillProps) {
  return (
    <span
      className={['info-pill', className].filter(Boolean).join(' ')}
      data-color-scheme={colorScheme}
      data-leading-dot={leadingDot || undefined}
    >
      {text}
    </span>
  )
}
