import { createRequire } from 'node:module'
import type { PushConfig } from '../config.ts'
import type { PushSendNotification, PushSendOptions } from './delivery.ts'

// web-push is CommonJS. Requiring it keeps the adapter usable under the backend's
// type-stripping runtime without depending on interop behaviour for a default export.
const require = createRequire(import.meta.url)
const webpush = require('web-push') as {
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options: PushSendOptions,
  ): Promise<{ statusCode: number }>
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void
}

export interface WebPushSender {
  readonly sendNotification: PushSendNotification
  readonly publicKey: string
}

/**
 * Creates the real web-push sender. VAPID details are process-wide in web-push, so they are set
 * once here at composition time rather than per delivery.
 *
 * The TTL and timeout are forwarded from the caller rather than defaulted here: web-push would
 * otherwise keep a stale service update for four weeks and wait indefinitely for the push
 * service to answer.
 */
export function createWebPushSender(push: PushConfig): WebPushSender {
  webpush.setVapidDetails(push.subject, push.publicKey, push.privateKey)
  return {
    publicKey: push.publicKey,
    sendNotification: (subscription, payload, options) =>
      webpush.sendNotification(subscription, payload, options),
  }
}
