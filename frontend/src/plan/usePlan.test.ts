import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api/client'
import type { Plan, PlanRequest } from '../api/types'
import { usePlan } from './usePlan'

vi.mock('../api/client', async importOriginal => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: { plan: vi.fn() },
}))
const plan = vi.mocked(api.plan)

const REQUEST: PlanRequest = {
  origin: { label: 'Chicago, IL', lat: 41.85, lon: -87.65 }, destination: { label: 'Denver, CO', lat: 39.74, lon: -104.98 },
  departure: '2026-10-24T13:00:00.000Z', load_lb: 45_000, interval_mi: 25,
}
const PLAN = { recommendation: { route_id: 'B' } } as Plan
const busy = () => new ApiError(503, { code: 'weather_busy', message: 'busy', retry_after: 30 })

describe('usePlan', () => {
  beforeEach(() => { vi.useFakeTimers(); plan.mockReset() })
  afterEach(() => { vi.useRealTimers() })

  async function started() {
    const hook = renderHook(() => usePlan())
    await act(async () => { hook.result.current.start(REQUEST) })
    return hook.result
  }

  it('plans a trip', async () => {
    plan.mockResolvedValue(PLAN)
    const result = await started()
    expect(result.current.state).toEqual({ status: 'done', request: REQUEST, plan: PLAN })
  })

  it('waits as long as a busy weather service asks, then tries again on its own', async () => {
    plan.mockRejectedValueOnce(busy()).mockResolvedValueOnce(PLAN)
    const result = await started()
    expect(result.current.state).toMatchObject({ status: 'waiting', wait: 30_000, attempt: 1 })

    await act(async () => { vi.advanceTimersByTime(29_000) })
    expect(plan).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(1_000) })
    expect(plan).toHaveBeenCalledTimes(2)
    expect(result.current.state.status).toBe('done')
  })

  it('gives up after three busy answers and says so', async () => {
    plan.mockRejectedValue(busy())
    const result = await started()
    await act(async () => { vi.advanceTimersByTime(30_000) })
    await act(async () => { vi.advanceTimersByTime(30_000) })
    expect(plan).toHaveBeenCalledTimes(3)
    expect(result.current.state).toMatchObject({ status: 'failed', error: { code: 'weather_busy' } })
  })

  it('reports other failures at once, without retrying', async () => {
    plan.mockRejectedValue(new ApiError(422, { code: 'no_route', message: 'No road connects these places.' }))
    const result = await started()
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(plan).toHaveBeenCalledTimes(1)
    expect(result.current.state).toMatchObject({ status: 'failed', error: { code: 'no_route' } })
  })

  it('cancel stops the request and a late answer is ignored', async () => {
    let answer!: (p: Plan) => void
    plan.mockImplementation((_r, signal) => new Promise(resolve => { answer = resolve; void signal }))
    const result = await started()
    expect(result.current.state.status).toBe('planning')
    expect(plan.mock.calls[0][1]?.aborted).toBe(false)

    act(() => result.current.cancel())
    expect(plan.mock.calls[0][1]?.aborted).toBe(true)
    await act(async () => answer(PLAN))
    expect(result.current.state).toEqual({ status: 'idle' })
  })

  it('cancel during a busy wait stops the retry', async () => {
    plan.mockRejectedValue(busy())
    const result = await started()
    act(() => result.current.cancel())
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(plan).toHaveBeenCalledTimes(1)
  })
})
