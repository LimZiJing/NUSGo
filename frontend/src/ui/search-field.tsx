import type { InputHTMLAttributes, Ref } from 'react'
import { SearchIcon } from './icons'

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly inputRef?: Ref<HTMLInputElement>
}

export function SearchField({ inputRef, ...inputProps }: SearchFieldProps) {
  return (
    <span className="search-field">
      <SearchIcon className="search-field-icon" />
      <input {...inputProps} ref={inputRef} type="search" />
    </span>
  )
}
