export type BuildingSourceRef = {
  readonly source: string
  readonly elementId: string
}

export type Building = {
  /** Stable NavUS ID, never reused, independent of the external elementId. */
  readonly id: string
  readonly name: string
  /** Alternative names and codes, used by search only. */
  readonly aliases: readonly string[]
  /** OpenStreetMap ID from the NUS Digital Twin API; the stable external reference. */
  readonly elementId: string
  /** Shared by parts that have the same normalised name (for example Cendana College). */
  readonly groupKey?: string
  /** Label for this part of a group, for example "Blocks 15-17". Needs a groupKey. */
  readonly partLabel?: string
  /** Block numbers this part covers, for example ["15", "16", "17"]. Needs a groupKey. */
  readonly blocks?: readonly string[]
  /** Where each block sits (x: longitude, y: latitude), keyed by a name in blocks. Not every block needs one. */
  readonly blockLocations?: Readonly<Record<string, { readonly x: number, readonly y: number }>>
  /** 'entrance' marks the group's main entrance record, which is not a building chip. Needs a groupKey. */
  readonly groupRole?: 'entrance'
  readonly address?: string
  readonly postal?: string
  /** API centroid (x: longitude, y: latitude). Not a verified pedestrian entrance. */
  readonly location: {
    readonly x: number
    readonly y: number
  }
  /**
   * 'centroid' marks an imported API footprint centroid, so it is never mistaken for an entrance.
   * 'provisional-entrance' marks an accepted but unverified entrance (OpenStreetMap node), recorded
   * in sourceRefs. A verified entrance will need its own kind.
   */
  readonly locationKind?: 'centroid' | 'provisional-entrance'
  /** Room-code building tokens that link venues to this building, for example "COM1". */
  readonly roomCodePrefixes: readonly string[]
  readonly sourceRefs: readonly BuildingSourceRef[]
}

export type BuildingCatalogueSource = {
  readonly name: string
  readonly url: string
  /** YYYY-MM-DD. */
  readonly fetchedOn: string
  readonly licenceNote: string
}

export type BuildingCatalogue = {
  readonly version: 1
  readonly source: BuildingCatalogueSource
  readonly buildings: readonly Building[]
}
