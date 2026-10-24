import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './client'

const reply = (status: number, body?: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body === undefined ? 'Bad Gateway' : JSON.stringify(body), { status }))

describe('api client', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('turns the server’s error answer into an ApiError with its details', async () => {
    reply(503, { error: { code: 'weather_busy', message: 'busy', retry_after: 30 } })
    await expect(api.health()).rejects.toMatchObject({ status: 503, code: 'weather_busy', retryAfter: 30 })
  })

  it('reads a bare 502 from a proxy as "the server isn’t answering"', async () => {
    reply(502)
    await expect(api.health()).rejects.toMatchObject({ code: 'network', message: 'The server isn’t answering. Try again in a moment.' })
  })

  it('reads no answer at all as a network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const failure = await api.health().catch(e => e)
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.code).toBe('network')
  })
})
