import type { LtaPublicBusStopMapping } from './bus-stop-mapping.ts'
import { isSingaporePublicHoliday } from './singapore-public-holidays.ts'

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

export interface LtaServiceOperation {
  readonly operating: boolean
  readonly nextStartMs: number | null
}

export type LtaScheduleLoader = (
  serviceNumber: string,
  busStopCode: string,
  atMs: number,
  signal: AbortSignal,
) => Promise<LtaServiceOperation | null>

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

interface SingaporeDateTime {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly weekday: number
  readonly minute: number
}

function localParts(atMs: number): SingaporeDateTime {
  const parts = new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(atMs))
  const weekday = parts.find((part) => part.type === 'weekday')?.value
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value)
  return {
    year,
    month,
    day,
    weekday: weekday === 'Sat' ? 6 : weekday === 'Sun' ? 0 : 1,
    minute: hour * 60 + minute,
  }
}

function dateKey({ year, month, day }: SingaporeDateTime): string {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

function dateOffset(date: SingaporeDateTime, offset: number): SingaporeDateTime {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day + offset))
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
    weekday: value.getUTCDay(),
    minute: 0,
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

function windowForDate(schedule: LtaServiceSchedule, date: SingaporeDateTime): LtaServiceOperatingWindow | null {
  return isSingaporePublicHoliday(dateKey(date)) ? schedule.sunday : windowFor(schedule, date.weekday)
}

function minutesFromTime(value: string): number | null {
  const time = parseTime(value)
  if (!time) return null
  if (time === '2400') return 1_440
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(2))
}

function startAtMs(date: SingaporeDateTime, minutes: number): number {
  const startDate = minutes === 1_440 ? dateOffset(date, 1) : date
  const timeOfDay = minutes % 1_440
  const hour = Math.floor(timeOfDay / 60).toString().padStart(2, '0')
  const minute = (timeOfDay % 60).toString().padStart(2, '0')
  return Date.parse(`${dateKey(startDate)}T${hour}:${minute}:00+08:00`)
}

/** Next first bus strictly after `atMs`, using Singapore holiday windows through a week ahead. */
export function getNextLtaServiceStart(schedule: LtaServiceSchedule, atMs: number): number | null {
  const date = localParts(atMs)
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidateDate = dateOffset(date, offset)
    const window = windowForDate(schedule, candidateDate)
    const firstBus = window ? minutesFromTime(window.firstBus) : null
    if (firstBus === null) continue

    const candidateStartAtMs = startAtMs(candidateDate, firstBus)
    if (candidateStartAtMs <= atMs) continue
    return candidateStartAtMs
  }
  return null
}

export function isLtaServiceOperating(schedule: LtaServiceSchedule, atMs: number): boolean {
  const date = localParts(atMs)
  const current = windowForDate(schedule, date)
  const { minute } = date
  if (current && windowContainsCurrentDay(current, minute)) return true

  const previous = windowForDate(schedule, dateOffset(date, -1))
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
  const baseUrl = options.baseUrl ?? 'https://datamall2.mytransport.sg/ltaodataservice/BusRoutes'
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
    const nextStarts = matches
      .map((schedule) => getNextLtaServiceStart(schedule, atMs))
      .filter((start): start is number => start !== null)
    return {
      operating: matches.some((schedule) => isLtaServiceOperating(schedule, atMs)),
      nextStartMs: nextStarts.length > 0 ? Math.min(...nextStarts) : null,
    }
  }
}
