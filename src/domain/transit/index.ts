import type { TransitNetwork, TransitRoute, TransitStop } from './types'

export interface TransitNetworkIndex {
  readonly routeById: ReadonlyMap<string, TransitRoute>
  readonly stopById: ReadonlyMap<string, TransitStop>
  readonly stopIdsByRouteId: ReadonlyMap<string, ReadonlySet<string>>
  readonly routeIdsByStopId: ReadonlyMap<string, ReadonlySet<string>>
}

function createReadonlySet<T>(values: Iterable<T>): ReadonlySet<T> {
  const set = new Set(values)
  const readonlySet: ReadonlySet<T> = {
    get size() {
      return set.size
    },
    has: (value) => set.has(value),
    entries: () => set.entries(),
    keys: () => set.keys(),
    values: () => set.values(),
    forEach: (callback, thisArg) => {
      set.forEach((value) => callback.call(thisArg, value, value, readonlySet))
    },
    [Symbol.iterator]: () => set[Symbol.iterator](),
  }

  return Object.freeze(readonlySet)
}

function createReadonlyMap<K, V>(
  entries: Iterable<readonly [K, V]>,
): ReadonlyMap<K, V> {
  const map = new Map(entries)
  const readonlyMap: ReadonlyMap<K, V> = {
    get size() {
      return map.size
    },
    get: (key) => map.get(key),
    has: (key) => map.has(key),
    entries: () => map.entries(),
    keys: () => map.keys(),
    values: () => map.values(),
    forEach: (callback, thisArg) => {
      map.forEach((value, key) => callback.call(thisArg, value, key, readonlyMap))
    },
    [Symbol.iterator]: () => map[Symbol.iterator](),
  }

  return Object.freeze(readonlyMap)
}

export function createTransitNetworkIndex(
  network: TransitNetwork,
): TransitNetworkIndex {
  const stopIdsByRouteEntries = network.routes.map((route): readonly [string, ReadonlySet<string>] => [
    route.id,
    createReadonlySet(route.stopIds),
  ] as const)
  const routeIdsByStopId = new Map<string, Set<string>>()

  for (const route of network.routes) {
    for (const stopId of route.stopIds) {
      const routeIds = routeIdsByStopId.get(stopId) ?? new Set<string>()
      routeIds.add(route.id)
      routeIdsByStopId.set(stopId, routeIds)
    }
  }

  return Object.freeze({
    routeById: createReadonlyMap(
      network.routes.map((route) => [route.id, route] as const),
    ),
    stopById: createReadonlyMap(
      network.stops.map((stop) => [stop.id, stop] as const),
    ),
    stopIdsByRouteId: createReadonlyMap(stopIdsByRouteEntries),
    routeIdsByStopId: createReadonlyMap(
      [...routeIdsByStopId.entries()].map(([stopId, routeIds]) => [
        stopId,
        createReadonlySet(routeIds),
      ]),
    ),
  })
}
