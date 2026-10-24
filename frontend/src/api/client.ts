import type { ApiErrorBody, ErrorCode, Plan, PlanRequest, PlaceResult } from './types'

/** Every failure, from the server's error envelope or from the network, as one error type. */
export class ApiError extends Error {
  readonly status: number
  readonly code: ErrorCode
  readonly fields?: Record<string, unknown>
  readonly retryAfter?: number

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message)
    this.status = status
    this.code = body.code
    this.fields = body.fields
    this.retryAfter = body.retry_after
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  } catch (error) {
    if (init?.signal?.aborted) throw error
    throw new ApiError(0, { code: 'network', message: 'Could not reach the server. Check your connection.' })
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(response.status, body?.error ?? { code: 'error', message: `The server answered ${response.status}.` })
  }
  return body as T
}

export const api = {
  health: () => request<{ status: string }>('/api/health/'),
  places: (q: string, source: 'towns' | 'search', signal?: AbortSignal) =>
    request<{ results: PlaceResult[] }>(`/api/places/?${new URLSearchParams({ q, source })}`, { signal }),
  plan: (body: PlanRequest, signal?: AbortSignal) =>
    request<Plan>('/api/plans/', { method: 'POST', body: JSON.stringify(body), signal }),
}
