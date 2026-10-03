export interface JourneyBenchmarkAdapterIdentity {
  readonly id: string
  readonly path: string
}

export function assertUniqueAdapterIds(adapters: readonly JourneyBenchmarkAdapterIdentity[]): void {
  const pathsById = new Map<string, Set<string>>()
  for (const { id, path } of adapters) {
    const paths = pathsById.get(id) ?? new Set<string>()
    paths.add(path)
    pathsById.set(id, paths)
  }

  const duplicates = [...pathsById]
    .filter(([, paths]) => paths.size > 1)
    .map(([id]) => id)
    .sort()
  if (duplicates.length > 0) {
    throw new Error(`Adapter IDs must be unique across paths: ${duplicates.join(', ')}`)
  }
}
