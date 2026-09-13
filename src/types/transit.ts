export interface ShuttleService {
  name: string
  routeId?: number
}

export interface BusStop {
  caption: string
  name: string
  longName: string
  shortName: string
  latitude: number
  longitude: number
  shuttles: ShuttleService[]
  opposite?: string | null
}
