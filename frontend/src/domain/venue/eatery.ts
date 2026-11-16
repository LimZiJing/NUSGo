import type { EateryCategory } from '@nusgo/shared/venue/types'

export function getEateryCategoryLabel(category: EateryCategory): string {
  switch (category) {
    case 'canteen': return 'Canteen'
    case 'restaurant': return 'Restaurant'
    case 'drinks & snacks': return 'Drinks & snacks'
  }
}
