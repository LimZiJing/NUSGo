export {
  SHUTTLE_SERVICE_START_GRACE_MINUTES,
  SHUTTLE_SERVICE_HOURS_REFRESH_INTERVAL_MS,
  getNextShuttleServiceStart,
  evaluateShuttleService,
  describeShuttleServiceUnavailable,
} from '@nusgo/shared/transit/service-hours-policy'
export type {
  ShuttleServiceStatus,
  ShuttleServiceEvaluation,
  ShuttleServiceStart,
} from '@nusgo/shared/transit/service-hours-policy'
export type { ShuttleServiceWindow } from '@nusgo/shared'
