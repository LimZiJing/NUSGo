import { ChevronDownIcon } from './icons'

interface DisclosureChevronProps {
  readonly expanded: boolean
  readonly className?: string
}

export function DisclosureChevron({ expanded, className }: DisclosureChevronProps) {
  return (
    <ChevronDownIcon
      className={className ? `disclosure-chevron ${className}` : 'disclosure-chevron'}
      data-expanded={expanded ? 'true' : 'false'}
    />
  )
}
