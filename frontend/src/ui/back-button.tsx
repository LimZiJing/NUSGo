import type { Ref } from 'react'
import { Button, IconButton } from './button'
import { ArrowLeftIcon } from './icons'

export type BackButtonMode = 'header' | 'inline' | 'label-only'

interface BackButtonProps {
  readonly mode: BackButtonMode
  readonly label: string
  readonly title?: string
  readonly onClick: () => void
  readonly ref?: Ref<HTMLButtonElement>
}

export function BackButton({ mode, label, title, onClick, ref }: BackButtonProps) {
  if (mode === 'header') {
    return (
      <IconButton
        label={label}
        title={title}
        icon={<ArrowLeftIcon />}
        variant="plain"
        ref={ref}
        onClick={onClick}
      />
    )
  }

  return (
    <Button
      data-back-button-mode={mode === 'inline' ? 'inline' : undefined}
      title={title}
      variant="ghost"
      icon={mode === 'inline' ? <ArrowLeftIcon /> : undefined}
      label={label}
      ref={ref}
      onClick={onClick}
    />
  )
}