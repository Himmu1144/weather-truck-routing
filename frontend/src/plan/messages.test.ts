import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { describe as words, fieldErrors } from './messages'

describe('fieldErrors', () => {
  it('puts each server message on its form field, whatever its nesting', () => {
    const error = new ApiError(400, {
      code: 'invalid_request', message: 'Some fields need fixing.',
      fields: {
        origin: { non_field_errors: ['Pick a place in the contiguous United States.'] },
        departure: ['Departure can’t be in the past.'],
        load_lb: ['Ensure this value is less than or equal to 80000.'],
      },
    })
    expect(fieldErrors(error)).toEqual({
      origin: 'Pick a place in the contiguous United States.',
      departure: 'Departure can’t be in the past.',
      load_lb: 'Ensure this value is less than or equal to 80000.',
    })
  })
})

describe('describe', () => {
  it('offers a retry only where trying again can help', () => {
    const can = (code: string) => words(new ApiError(500, { code, message: '' })).canRetry
    expect(can('routing_unavailable')).toBe(true)
    expect(can('network')).toBe(true)
    expect(can('no_route')).toBe(false)
    expect(can('invalid_request')).toBe(false)
  })
})
