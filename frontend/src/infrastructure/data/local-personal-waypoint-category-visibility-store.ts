import { PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH } from '../../domain/waypoints/personal/personal-waypoint'
import type {
  PersonalWaypointCategoryVisibilityStore,
  PersonalWaypointCategoryVisibilityReadResult,
  PersonalWaypointCategoryVisibilityWriteResult,
} from '../../domain/waypoints/personal/personal-waypoint-category-visibility-store'

export const PERSONAL_WAYPOINT_CATEGORY_VISIBILITY_KEY = 'navus:personal-waypoint-category-visibility:v1'
const PERSONAL_WAYPOINT_CATEGORY_VISIBILITY_VERSION = 1

type BrowserStorage = Pick<Storage, 'getItem' | 'setItem'>
type StorageProvider = () => BrowserStorage

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidCategory(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 &&
    value.length <= PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH
}

function parseHiddenCategories(raw: string): readonly string[] | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }

  if (
    !isRecord(value) ||
    value.version !== PERSONAL_WAYPOINT_CATEGORY_VISIBILITY_VERSION ||
    !Array.isArray(value.hiddenCategories) ||
    Object.keys(value).some((key) => key !== 'version' && key !== 'hiddenCategories') ||
    value.hiddenCategories.some((category) => !isValidCategory(category))
  ) return null

  return [...new Set(value.hiddenCategories)]
}

export function createLocalPersonalWaypointCategoryVisibilityStore(
  getStorage: StorageProvider = () => window.localStorage,
): PersonalWaypointCategoryVisibilityStore {
  function read(): PersonalWaypointCategoryVisibilityReadResult {
    let raw: string | null
    try {
      raw = getStorage().getItem(PERSONAL_WAYPOINT_CATEGORY_VISIBILITY_KEY)
    } catch {
      return { kind: 'unavailable' }
    }

    if (raw === null) return { kind: 'ready', hiddenCategories: [] }
    const hiddenCategories = parseHiddenCategories(raw)
    return hiddenCategories === null
      ? { kind: 'invalid' }
      : { kind: 'ready', hiddenCategories }
  }

  function write(hiddenCategories: readonly string[]): PersonalWaypointCategoryVisibilityWriteResult {
    if (hiddenCategories.some((category) => !isValidCategory(category))) return { kind: 'unavailable' }

    try {
      getStorage().setItem(PERSONAL_WAYPOINT_CATEGORY_VISIBILITY_KEY, JSON.stringify({
        version: PERSONAL_WAYPOINT_CATEGORY_VISIBILITY_VERSION,
        hiddenCategories: [...new Set(hiddenCategories)],
      }))
      return { kind: 'saved' }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  return { read, write }
}
