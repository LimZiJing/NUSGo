import { RAINROOM_THEME } from './rainroom/metadata'

const CORE_THEMES = [
  { id: 'light', label: 'Light', summary: 'Light', category: 'primary', galleryOrder: 0 },
  { id: 'dark', label: 'Dark', summary: 'Dark', category: 'primary', galleryOrder: 1 },
  { id: 'nus', label: 'NUS', summary: 'NUS palette', category: 'other', galleryOrder: 4 },
  { id: 'matcha', label: 'Matcha', summary: 'Matcha palette', category: 'other', galleryOrder: 2 },
  { id: 'sakura', label: 'Sakura', summary: 'Sakura palette', category: 'other', galleryOrder: 3 },
] as const

export const THEME_CATALOG = [...CORE_THEMES, RAINROOM_THEME] as const

export type Theme = (typeof THEME_CATALOG)[number]['id']

export const OTHER_THEMES = THEME_CATALOG.filter(({ category }) => category === 'other')

export const GALLERY_THEMES = [...THEME_CATALOG].sort(
  (left, right) => left.galleryOrder - right.galleryOrder,
)

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && THEME_CATALOG.some(({ id }) => id === value)
}
