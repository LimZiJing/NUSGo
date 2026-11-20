import { describe, expect, it } from 'vitest'
import {
  PUSH_NOTIFICATION_BODY_MAX_LENGTH,
  PUSH_NOTIFICATION_TITLE_MAX_LENGTH,
  createAlightReminderPayload,
  parsePushNotificationPayload,
} from './notifications.ts'
import {
  DEFAULT_PUSH_REMINDER_LEAD_TIME_SECONDS,
  PUSH_REMINDER_LEAD_TIME_OPTIONS_SECONDS,
  isPushReminderLeadTimeSeconds,
  parsePushReminderRegistration,
  parsePushReminderRequest,
  parsePushReminderResponse,
  parsePushReminderTarget,
} from './reminders.ts'

const keys = { p256dh: 'BCV2Y0YnotzQ', auth: 'k8Z0dP2vG2s' }

describe('alight reminder payload', () => {
  it('deep links to the watched stop and keeps the payload inside the validator bounds', () => {
    const payload = createAlightReminderPayload('COM3 Opp', 'COM3', 'D1', 1.6)

    expect(payload).toEqual({
      title: 'Bus D1 is due soon',
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
  it('pins the topic, reads the watch target and keeps the chosen lead time', () => {
    expect(parsePushReminderRegistration({
      endpoint: 'https://fcm.googleapis.com/fcm/send/a',
      keys,
      // A caller cannot file a stop watch under another topic.
      topic: 'service-updates',
      watch: { stopId: 'COM3', routeId: 'D1' },
      leadTimeSeconds: 60,
    })).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/a',
      keys,
      topic: 'alight-reminders',
      watch: { stopId: 'COM3', routeId: 'D1' },
      leadTimeSeconds: 60,
    })
  })

  it('defaults an omitted lead time to two minutes', () => {
    expect(parsePushReminderRegistration({
      endpoint: 'https://fcm.googleapis.com/fcm/send/a',
      keys,
      watch: { stopId: 'COM3', routeId: 'D1' },
    })?.leadTimeSeconds).toBe(DEFAULT_PUSH_REMINDER_LEAD_TIME_SECONDS)
    expect(DEFAULT_PUSH_REMINDER_LEAD_TIME_SECONDS).toBe(120)
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

  // An off-list lead time is rejected rather than rounded: the rider must see the value that
  // will actually be evaluated, so the server must not quietly substitute another one.
  it.each([0, 90, 121, 3600, '120', null, { seconds: 120 }])(
    'rejects the lead time %s because it is not one of the offered choices',
    (leadTimeSeconds) => {
      expect(parsePushReminderRegistration({
        endpoint: 'https://fcm.googleapis.com/fcm/send/a',
        keys,
        watch: { stopId: 'COM3', routeId: 'D1' },
        leadTimeSeconds,
      })).toBeNull()
    },
  )

  it('offers a short ascending list of whole-minute lead times', () => {
    expect([...PUSH_REMINDER_LEAD_TIME_OPTIONS_SECONDS]).toEqual([60, 120, 180])
    expect(PUSH_REMINDER_LEAD_TIME_OPTIONS_SECONDS.every((seconds) => seconds % 60 === 0)).toBe(true)
  })

  it('recognises only offered lead times', () => {
    expect(isPushReminderLeadTimeSeconds(60)).toBe(true)
    expect(isPushReminderLeadTimeSeconds(90)).toBe(false)
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

describe('alight reminder acknowledgement', () => {
  it('accepts the stored lead time and expiry', () => {
    expect(parsePushReminderResponse({
      topic: 'alight-reminders',
      leadTimeSeconds: 120,
      expiresAt: '2026-11-06T12:00:00.000Z',
    })).toEqual({
      topic: 'alight-reminders',
      leadTimeSeconds: 120,
      expiresAt: '2026-11-06T12:00:00.000Z',
    })
  })

  it.each([
    ['a wrong topic', { topic: 'service-updates', leadTimeSeconds: 120, expiresAt: '2026-11-06T12:00:00.000Z' }],
    ['an off-list lead time', { topic: 'alight-reminders', leadTimeSeconds: 90, expiresAt: '2026-11-06T12:00:00.000Z' }],
    ['an unreadable expiry', { topic: 'alight-reminders', leadTimeSeconds: 120, expiresAt: 'soon' }],
    ['a missing expiry', { topic: 'alight-reminders', leadTimeSeconds: 120 }],
    ['a non-object body', null],
  ])('rejects %s so the caller falls back to what it asked for', (_label, body) => {
    expect(parsePushReminderResponse(body)).toBeNull()
  })
})
