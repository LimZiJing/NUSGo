import { describe, expect, it, vi } from 'vitest'
import { createShuttleServiceHoursClient } from './client'

describe('createShuttleServiceHoursClient', () => {
  it('requests route IDs and validates the response', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      routes: {
        D2: [{ routeId: 'D2', firstTime: '07:15', lastTime: '23:00', dayType: 'Mon-Fri', dates: [] }],
      },
    }), { status: 200 }))
    const result = await createShuttleServiceHoursClient({ fetcher }).getServiceWindows(['D2', 'D2'], new AbortController().signal)

    expect(fetcher).toHaveBeenCalledWith(
      '/api/shuttle-service-windows?routes=D2',
      { signal: expect.any(AbortSignal) },
    )
    expect(result.D2?.[0]?.firstTime).toBe('07:15')
  })
})
