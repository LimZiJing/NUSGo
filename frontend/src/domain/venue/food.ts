import type { FoodType } from '@nusgo/shared/venue/types'

export function getFoodTypeLabel(foodType: FoodType): string {
  switch (foodType) {
    case 'canteen': return 'Canteen'
    case 'restaurant': return 'Restaurant'
    case 'drinks & snacks': return 'Drinks & snacks'
    default: return assertNever(foodType)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported Food type: ${String(value)}`)
}
