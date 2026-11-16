import type { EateryCategory } from '@nusgo/shared/venue/types'

export function getEateryCategoryLabel(category: EateryCategory): string {
  switch (category) {
    case 'canteen': return 'Canteen'
    case 'restaurant': return 'Restaurant'
    case 'drinks & snacks': return 'Drinks & snacks'
    default: return assertNever(category)
  }
}

export function getEateryCategoryFilterLabel(category: EateryCategory): string {
  switch (category) {
    case 'canteen': return 'Canteens'
    case 'restaurant': return 'Restaurants'
    case 'drinks & snacks': return 'Drinks & snacks'
    default: return assertNever(category)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported eatery category: ${String(value)}`)
}
