export function FavoriteStarIcon({ filled }: { readonly filled: boolean }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}>
      <path
        d="m12 2.5 2.93 5.94 6.56.95-4.75 4.63 1.12 6.53L12 17.47l-5.86 3.08 1.12-6.53-4.75-4.63 6.56-.95L12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}
