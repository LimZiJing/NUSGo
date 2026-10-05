export type LocationIdentityKind = 'venue' | 'stop'

export function LocationIdentityIcon({
  kind,
  className,
}: {
  readonly kind: LocationIdentityKind
  readonly className?: string
}) {
  return (
    <svg
      className={['location-identity-icon', `location-identity-icon--${kind}`, className]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
    >
      {kind === 'venue' ? (
        <>
          <path d="M4 21h16M6 21V4h8v17m0-11h4v11M9 8h2m-2 4h2m-2 4h2m4-2h2m-2 4h2" />
        </>
      ) : (
        <>
          <path d="M6 20V7.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2V20H6Z" />
          <path d="M9 5.5v-2h6v2M6 9H4a1 1 0 0 0-1 1v2m15-3h2a1 1 0 0 1 1 1v2M7.5 8h9v5.5h-9zM12 8v5.5m-3.8 2h1m5.6 0h1m-7.3 1.5h5m-7.5 1.5h2m8 0h2" />
        </>
      )}
    </svg>
  )
}
