import { buildStopDeepLink, type PushNotificationPayload } from '@nusgo/shared'
import type { ServiceUpdate } from './service-updates.ts'

/** Percent-encodes a value for a deep link, matching the shared contract's `?key=value` shape. */
function encode(value: string): string {
  return encodeURIComponent(value)
}

export function describeDelayMinutes(delaySeconds: number): number {
  return Math.max(1, Math.round(delaySeconds / 60))
}

/**
 * Builds the single-line notification a rider sees for a delayed bus at a stop.
 * Title and body stay short so they render on one line in Android and Wear OS notification
 * surfaces; the deep link carries the stop so a tap opens that stop's details.
 */
export function createDelayNotification(
  stopName: string,
  routeId: string,
  stopId: string,
  delaySeconds: number,
): PushNotificationPayload {
  return {
    title: 'Bus ' + routeId + ' delayed',
    body: describeDelayMinutes(delaySeconds) + ' min late at ' + stopName,
    url: buildStopDeepLink(stopId),
    topic: 'service-updates',
    tag: 'delay:' + encode(stopId) + ':' + encode(routeId),
  }
}

/** Builds the notification for a stop whose live arrivals have stopped updating. */
export function createUnavailableNotification(
  stopName: string,
  stopId: string,
): PushNotificationPayload {
  return {
    title: 'Live arrivals paused',
    body: 'No live update from ' + stopName + ' right now',
    url: buildStopDeepLink(stopId),
    topic: 'service-updates',
    tag: 'unavailable:' + encode(stopId),
  }
}

export interface ServiceUpdateNotificationContext {
  /** Resolves a canonical stop name for a stop ID. */
  readonly stopName: (stopId: string) => string | null
}

/**
 * Turns detected service updates into notification payloads. Updates for a stop the canonical
 * data no longer contains are skipped rather than shown with a raw ID.
 */
export function createServiceUpdateNotifications(
  updates: readonly ServiceUpdate[],
  context: ServiceUpdateNotificationContext,
): readonly PushNotificationPayload[] {
  return updates.flatMap((update) => {
    const stopName = context.stopName(update.stopId)
    if (!stopName) return []
    return [update.kind === 'delay'
      ? createDelayNotification(stopName, update.routeId, update.stopId, update.delaySeconds)
      : createUnavailableNotification(stopName, update.stopId)]
  })
}
