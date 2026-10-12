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
  readonly address?: string
  readonly postal?: string
  /** API centroid (x: longitude, y: latitude). Not a verified pedestrian entrance. */
  readonly location: {
    readonly x: number
    readonly y: number
  }
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
