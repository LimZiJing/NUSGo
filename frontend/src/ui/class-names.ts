export function joinClassNames(...classNames: readonly (string | undefined)[]): string {
  return classNames.filter(Boolean).join(' ')
}
