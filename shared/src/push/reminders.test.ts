import { describe, expect, it } from 'vitest'
import {
  PUSH_NOTIFICATION_BODY_MAX_LENGTH,
  PUSH_NOTIFICATION_TITLE_MAX_LENGTH,
  createAlightReminderPayload,
  parsePushNotificationPayload,
} from './notifications.ts'
import {
  parsePushReminderRegistration,
  parsePushReminderRequest,
  parsePushReminderTarget,
} from './reminders.ts'

const keys = { p256dh: 'BCV2Y0YnotzQ', auth: 'k8Z0dP2vG2s' }

describe('alight reminder payload', () => {
  it('deep links to the watched stop and keeps the payload inside the validator bounds', () => {
    const payload = createAlightReminderPayload('COM3 Opp', 'COM3', 'D1', 1.6)

    expect(payload).toEqual({
      title: 'Bus D1 is arriving',
      body: 'About 2 min to COM3 Opp',
      url: '?stop=COM3',
      topic: 'alight-reminders',
      tag: 'reminder:COM3:D1',
    })
    // The service worker runs the same validator, so this payload must survive it unchanged.
    expect(parsePushNotificationPayload(JSON.parse(JSON.stringify(payload)))).toEqual(payload)
  })

  it('never says "arriving" more than a minute out, even at zero seconds', () => {
    expect(createAlightReminderPayload('COM3 Opp', 'COM3', 'D1', 0).body).toBe('About 1 min to COM3 Opp')
  })

  it('shortens a long stop name instead of producing a body the validator would drop', () => {
    const payload = createAlightReminderPayload('S'.repeat(400), 'COM3', 'D1', 2)

    expect(payload.body.length).toBeLessThanOrEqual(PUSH_NOTIFICATION_BODY_MAX_LENGTH)
    expect(payload.title.length).toBeLessThanOrEqual(PUSH_NOTIFICATION_TITLE_MAX_LENGTH)
    expect(parsePushNotificationPayload(payload)).toEqual(payload)
  })
})

describe('alight reminder registration', () => {
  it('pins the topic and reads the watch target', () => {
    expect(parsePushReminderRegistration({
      endpoint: 'https://fcm.googleapis.com/fcm/send/a',
      keys,
      // A caller cannot file a stop watch under another topic.
      topic: 'service-updates',
      watch: { stopId: 'COM3', routeId: 'D1' },
    })).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/a',
      keys,
      topic: 'alight-reminders',
      watch: { stopId: 'COM3', routeId: 'D1' },
    })
  })

  it.each([
    ['no watch', { watch: undefined }],
    ['missing route', { watch: { stopId: 'COM3' } }],
    ['blank stop', { watch: { stopId: '  ', routeId: 'D1' } }],
    ['spaces in id', { watch: { stopId: 'COM 3', routeId: 'D1' } }],
    ['over-long id', { watch: { stopId: 'X'.repeat(33), routeId: 'D1' } }],
  ])('rejects a registration with %s', (_label, patch) => {
    expect(parsePushReminderRegistration({
      endpoint: 'https://fcm.googleapis.com/fcm/send/a',
      keys,
      ...patch,
    })).toBeNull()
  })

  it('rejects an endpoint that is not HTTPS, because the sender would post to it', () => {
    expect(parsePushReminderRegistration({
      endpoint: 'http://fcm.googleapis.com/fcm/send/a',
      keys,
      watch: { stopId: 'COM3', routeId: 'D1' },
    })).toBeNull()
  })

  it('reads a reminder target and endpoint on their own', () => {
    expect(parsePushReminderTarget({ stopId: 'TCOMS-OPP', routeId: 'R2' }))
      .toEqual({ stopId: 'TCOMS-OPP', routeId: 'R2' })
    expect(parsePushReminderTarget([])).toBeNull()
    expect(parsePushReminderRequest({ endpoint: 'https://fcm.googleapis.com/fcm/send/a' }))
      .toBe('https://fcm.googleapis.com/fcm/send/a')
    expect(parsePushReminderRequest({ endpoint: 'javascript:alert(1)' })).toBeNull()
  })
})
