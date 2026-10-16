import type { LtaPublicBusStopMapping } from './bus-stop-mapping.ts'

export interface LtaServiceOperatingWindow {
  readonly firstBus: string
  readonly lastBus: string
}

export interface LtaServiceSchedule {
  readonly serviceNumber: string
  readonly busStopCode: string
  readonly weekday: LtaServiceOperatingWindow | null
  readonly saturday: LtaServiceOperatingWindow | null
  readonly sunday: LtaServiceOperatingWindow | null
}

export type LtaScheduleLoader = (
  serviceNumber: string,
  busStopCode: string,
  atMs: number,
  signal: AbortSignal,
) => Promise<boolean | null>

interface RecordValue {
  readonly [key: string]: unknown
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseTime(value: unknown): string | null {
  const text = readText(value)
  return text && /^(?:[01]\d|2[0-3])(?:[0-5]\d)$/.test(text)
    ? text
    : text === '2400'
      ? text
      : null
}

function parseWindow(first: unknown, last: unknown): LtaServiceOperatingWindow | null {
  const firstBus = parseTime(first)
  const lastBus = parseTime(last)
  return firstBus && lastBus ? { firstBus, lastBus } : null
}

export function parseLtaServiceSchedule(input: unknown): LtaServiceSchedule | null {
  if (!isRecord(input)) return null
  const serviceNumber = readText(input.ServiceNo)
  const busStopCode = readText(input.BusStopCode)
  if (!serviceNumber || !busStopCode) return null
  return {
    serviceNumber,
    busStopCode,
    weekday: parseWindow(input.WD_FirstBus, input.WD_LastBus),
    saturday: parseWindow(input.SAT_FirstBus, input.SAT_LastBus),
    sunday: parseWindow(input.SUN_FirstBus, input.SUN_LastBus),
  }
}

function localParts(atMs: number): { readonly weekday: number; readonly minute: number } {
  const parts = new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(atMs))
  const weekday = parts.find((part) => part.type === 'weekday')?.value
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value)
  return {
    weekday: weekday === 'Sat' ? 6 : weekday === 'Sun' ? 0 : 1,
    minute: hour * 60 + minute,
  }
}

function windowContainsCurrentDay(window: LtaServiceOperatingWindow, minute: number): boolean {
  const first = Number(window.firstBus.slice(0, 2)) * 60 + Number(window.firstBus.slice(2))
  const last = window.lastBus === '2400'
    ? 1_440
    : Number(window.lastBus.slice(0, 2)) * 60 + Number(window.lastBus.slice(2))
  if (first === last) return false
  if (last > first) return minute >= first && minute <= last
  return minute >= first
}

function windowFor(schedule: LtaServiceSchedule, weekday: number): LtaServiceOperatingWindow | null {
  return weekday === 0 ? schedule.sunday : weekday === 6 ? schedule.saturday : schedule.weekday
}

export function isLtaServiceOperating(schedule: LtaServiceSchedule, atMs: number): boolean {
  const { weekday, minute } = localParts(atMs)
  const current = windowFor(schedule, weekday)
  if (current && windowContainsCurrentDay(current, minute)) return true

  const previousWeekday = weekday === 0 ? 6 : weekday - 1
  const previous = windowFor(schedule, previousWeekday)
  if (!previous) return false
  const first = Number(previous.firstBus.slice(0, 2)) * 60 + Number(previous.firstBus.slice(2))
  const last = previous.lastBus === '2400'
    ? 1_440
    : Number(previous.lastBus.slice(0, 2)) * 60 + Number(previous.lastBus.slice(2))
  return last < first && minute <= last
}

function scheduleKey(serviceNumber: string, busStopCode: string): string {
  return `${serviceNumber}\u0000${busStopCode}`
}

export function createLtaScheduleLoader(options: {
  readonly accountKey: string
  readonly fetcher: typeof fetch
  readonly baseUrl?: string
  readonly mappings: readonly LtaPublicBusStopMapping[]
}): LtaScheduleLoader {
  const baseUrl = options.baseUrl ?? 'https://datamall2.mytransport.sg/ltaodataservice/v3/BusRoutes'
  const wanted = new Set(options.mappings.flatMap(({ busStopCode, services }) => services.map((service) => scheduleKey(service, busStopCode))))
  let schedulesPromise: Promise<ReadonlyMap<string, readonly LtaServiceSchedule[]>> | null = null

  const loadAll = async (signal: AbortSignal): Promise<ReadonlyMap<string, readonly LtaServiceSchedule[]>> => {
    const schedules = new Map<string, LtaServiceSchedule[]>()
    for (let skip = 0; ; skip += 500) {
      const response = await options.fetcher(`${baseUrl}?$skip=${skip}`, {
        headers: { Accept: 'application/json', AccountKey: options.accountKey },
        signal,
      })
      if (!response.ok) throw new Error('LTA DataMall route request failed: ' + response.status)
      const input = await response.json() as unknown
      if (!isRecord(input) || !Array.isArray(input.value)) throw new Error('LTA bus route response was invalid')
      for (const record of input.value) {
        const schedule = parseLtaServiceSchedule(record)
        if (!schedule || !wanted.has(scheduleKey(schedule.serviceNumber, schedule.busStopCode))) continue
        const key = scheduleKey(schedule.serviceNumber, schedule.busStopCode)
        schedules.set(key, [...(schedules.get(key) ?? []), schedule])
      }
      if (input.value.length < 500) break
    }
    return schedules
  }

  return async (serviceNumber, busStopCode, atMs, signal) => {
    if (!wanted.has(scheduleKey(serviceNumber, busStopCode))) return null
    schedulesPromise ??= loadAll(signal).catch((error: unknown) => {
      schedulesPromise = null
      throw error
    })
    const schedules = await schedulesPromise
    const matches = schedules.get(scheduleKey(serviceNumber, busStopCode))
    if (!matches?.length) return null
    return matches.some((schedule) => isLtaServiceOperating(schedule, atMs))
  }
}
