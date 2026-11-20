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
 * Title and body stay short so a notification shows on one line in compact system
 * notification surfaces; the deep link carries the stop so a tap opens that stop's details.
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

export interface ServiceUpdateNotifications {
  readonly payloads: readonly PushNotificationPayload[]
  /**
   * For each payload, the index of the update it was built from. Updates for a stop the
   * canonical data no longer names produce no payload, so this mapping is what lets a caller
   * score payloads by their own update instead of assuming the arrays line up.
   */
  readonly updateIndexByPayloadIndex: readonly number[]
}

/**
 * Turns detected service updates into notification payloads. Updates for a stop the canonical
 * data no longer contains are skipped rather than shown with a raw ID.
 */
export function createServiceUpdateNotifications(
  updates: readonly ServiceUpdate[],
  context: ServiceUpdateNotificationContext,
): ServiceUpdateNotifications {
  const payloads: PushNotificationPayload[] = []
  const updateIndexByPayloadIndex: number[] = []
  updates.forEach((update, updateIndex) => {
    const stopName = context.stopName(update.stopId)
    if (!stopName) return
    payloads.push(update.kind === 'delay'
      ? createDelayNotification(stopName, update.routeId, update.stopId, update.delaySeconds)
      : createUnavailableNotification(stopName, update.stopId))
    updateIndexByPayloadIndex.push(updateIndex)
  })
  return { payloads, updateIndexByPayloadIndex }
}
