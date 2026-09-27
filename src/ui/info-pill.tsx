export type InfoPillColorScheme = 'neutral' | 'success'

interface InfoPillProps {
  readonly text: string
  readonly colorScheme: InfoPillColorScheme
  readonly className?: string
}

export function InfoPill({ text, colorScheme, className }: InfoPillProps) {
  return (
    <span className={['info-pill', className].filter(Boolean).join(' ')} data-color-scheme={colorScheme}>
      {text}
    </span>
  )
}
