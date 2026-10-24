import type { ApiError } from '../api/client'
import type { Errors } from '../form/check'

/** A failure in words, and whether trying the same request again can help. */
export function describe(error: ApiError): { title: string; detail: string; canRetry: boolean } {
  switch (error.code) {
    case 'invalid_request':
      return { title: 'Some fields need fixing', detail: 'The marked fields below were not accepted.', canRetry: false }
    case 'no_route':
      return { title: 'No road connects these places', detail: 'Check the two places; both must be in the contiguous United States.', canRetry: false }
    case 'routing_unavailable':
      return { title: 'The routing services are not answering', detail: 'They are free public servers and sometimes slow down. Try again in a moment.', canRetry: true }
    case 'weather_unavailable':
      return { title: 'The weather service is not answering', detail: error.message, canRetry: true }
    case 'weather_busy':
      return { title: 'The weather service is still busy', detail: 'Its free tier allows a limited number of forecasts a minute. Try again in a minute.', canRetry: true }
    case 'network':
      return { title: 'Could not reach the server', detail: error.message, canRetry: true }
    default:
      return { title: 'Planning failed', detail: error.message, canRetry: true }
  }
}

/** The server's field errors ({"departure": ["..."], "origin": {"non_field_errors": ["..."]}}) as one line per form field. */
export function fieldErrors(error: ApiError): Errors {
  const first = (value: unknown): string | undefined =>
    typeof value === 'string' ? value
      : Array.isArray(value) ? first(value[0])
        : value && typeof value === 'object' ? first(Object.values(value)[0]) : undefined
  const found: Errors = {}
  for (const key of ['origin', 'destination', 'departure', 'load_lb'] as const) {
    const message = first(error.fields?.[key])
    if (message) found[key] = message
  }
  return found
}
