import type { ReactNode } from 'react'
import { Field } from '@base-ui/react/field'
import { AlertCircleIcon } from '../../../../ui/icons'
import type { SubmissionDraft } from './draft'

export function SubmissionField({
  id,
  name,
  label,
  error,
  layout,
  children,
}: {
  readonly id: string
  readonly name: keyof SubmissionDraft
  readonly label: string
  readonly error: string | undefined
  readonly layout?: 'select' | 'floor' | 'multiline' | 'search'
  readonly children: ReactNode
}) {
  const className = ['community-waypoint-field', layout && `community-waypoint-field--${layout}`]
    .filter(Boolean)
    .join(' ')

  return (
    <Field.Root className={className} name={name} invalid={Boolean(error)}>
      {layout === 'floor' ? (
        <span id={`${id}-label`} className="community-waypoint-field-label">{label}</span>
      ) : (
        <Field.Label className="community-waypoint-field-label" htmlFor={id}>
          {label}
        </Field.Label>
      )}
      {children}
      {error && <Field.Error
        id={`${id}-error`}
        className="community-waypoint-field-error"
        match={Boolean(error)}
      >
        <AlertCircleIcon className="community-waypoint-field-error-icon" size={14} />
        <span>{error}</span>
      </Field.Error>}
    </Field.Root>
  )
}
