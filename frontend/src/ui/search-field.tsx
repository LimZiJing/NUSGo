import type { InputHTMLAttributes, Ref } from 'react'

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly inputRef?: Ref<HTMLInputElement>
}

export function SearchField({ inputRef, ...inputProps }: SearchFieldProps) {
  return (
    <span className="search-field">
      <svg className="search-field-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <circle cx="10.75" cy="10.75" r="6.75" />
        <path d="m16 16 5 5" />
      </svg>
      <input {...inputProps} ref={inputRef} type="search" />
    </span>
  )
}
