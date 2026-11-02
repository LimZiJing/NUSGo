export type PersonalWaypointCategoryVisibilityReadResult =
  | { readonly kind: 'ready'; readonly hiddenCategories: readonly string[] }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unavailable' }

export type PersonalWaypointCategoryVisibilityWriteResult =
  | { readonly kind: 'saved' }
  | { readonly kind: 'unavailable' }

export interface PersonalWaypointCategoryVisibilityStore {
  read(): PersonalWaypointCategoryVisibilityReadResult
  write(hiddenCategories: readonly string[]): PersonalWaypointCategoryVisibilityWriteResult
}
