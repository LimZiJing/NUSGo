import { createRequire } from 'node:module'
import type { PushConfig } from '../config.ts'
import type { PushSendNotification } from './delivery.ts'

// web-push is CommonJS. Requiring it keeps the adapter usable under the backend's
// type-stripping runtime without depending on interop behaviour for a default export.
const require = createRequire(import.meta.url)
const webpush = require('web-push') as {
  sendNotification: PushSendNotification
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void
}

export interface WebPushSender {
  readonly sendNotification: PushSendNotification
  readonly publicKey: string
}

/**
 * Creates the real web-push sender. VAPID details are process-wide in web-push, so they are set
 * once here at composition time rather than per delivery.
 */
export function createWebPushSender(push: PushConfig): WebPushSender {
  webpush.setVapidDetails(push.subject, push.publicKey, push.privateKey)
  return {
    publicKey: push.publicKey,
    sendNotification: (subscription, payload) => webpush.sendNotification(subscription, payload),
  }
}
