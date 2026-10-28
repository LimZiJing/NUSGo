import { joinClassNames } from './class-names'
import { Pill, type PillTone } from './pill'

export type InfoPillColorScheme = PillTone

interface InfoPillProps {
  readonly text: string
  readonly colorScheme: InfoPillColorScheme
  readonly className?: string
  readonly leadingDot?: boolean
  readonly pulse?: boolean
}

export function InfoPill({ text, colorScheme, className, leadingDot = false, pulse = false }: InfoPillProps) {
  return (
    <Pill
      className={joinClassNames('info-pill', className)}
      label={text}
      tone={colorScheme}
      leadingDot={leadingDot}
      pulse={pulse}
    />
  )
}
