import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../api/client'
import type { Plan, PlanRequest } from '../api/types'

export type PlanState =
  | { status: 'idle' }
  | { status: 'planning'; request: PlanRequest; since: number; attempt: number }
  | { status: 'waiting'; request: PlanRequest; until: number; wait: number; attempt: number } // weather service busy
  | { status: 'failed'; request: PlanRequest; error: ApiError }
  | { status: 'done'; request: PlanRequest; plan: Plan }

export const MAX_ATTEMPTS = 3
const DEFAULT_WAIT_S = 30

/** Sends a plan request and follows it: a busy weather service is retried on its own after
 *  the wait the server asks for, up to MAX_ATTEMPTS; anything else is reported. */
export function usePlan() {
  const [state, setState] = useState<PlanState>({ status: 'idle' })
  const job = useRef<{ controller?: AbortController; timer?: number }>({})

  // The same functions on every render, so components handed them don't redraw for nothing.
  const stop = useCallback(() => {
    job.current.controller?.abort()
    clearTimeout(job.current.timer)
  }, [])
  useEffect(() => stop, [stop])

  const run = useCallback(function run(request: PlanRequest, attempt: number) {
    stop()
    const controller = (job.current.controller = new AbortController())
    setState({ status: 'planning', request, since: Date.now(), attempt })
    api.plan(request, controller.signal).then(
      plan => { if (!controller.signal.aborted) setState({ status: 'done', request, plan }) },
      (error: unknown) => {
        if (controller.signal.aborted) return   // cancelled or replaced: a late answer changes nothing
        const failure = error instanceof ApiError ? error
          : new ApiError(0, { code: 'network', message: 'Something went wrong while planning.' })
        if (failure.code === 'weather_busy' && attempt < MAX_ATTEMPTS) {
          const wait = (failure.retryAfter ?? DEFAULT_WAIT_S) * 1000
          setState({ status: 'waiting', request, until: Date.now() + wait, wait, attempt })
          job.current.timer = window.setTimeout(() => run(request, attempt + 1), wait)
        } else {
          setState({ status: 'failed', request, error: failure })
        }
      },
    )
  }, [stop])
  const start = useCallback((request: PlanRequest) => run(request, 1), [run])

  return {
    state,
    start,
    /** Ask again now: after a failure, or without waiting out a busy countdown. */
    retry: () => { if ('request' in state) run(state.request, state.status === 'waiting' ? state.attempt + 1 : 1) },
    /** Stop planning and go back to the form, which keeps what was typed. */
    cancel: () => { stop(); setState({ status: 'idle' }) },
  }
}
