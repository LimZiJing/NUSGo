export const MOBILE_SHEET_DETENTS = ['collapsed', 'partial', 'full'] as const

export type MobileSheetDetent = (typeof MOBILE_SHEET_DETENTS)[number]
export type OpenMobileSheetDetent = Exclude<MobileSheetDetent, 'collapsed'>

export function isOpenMobileSheetDetent(
  detent: MobileSheetDetent,
): detent is OpenMobileSheetDetent {
  return detent !== 'collapsed'
}
