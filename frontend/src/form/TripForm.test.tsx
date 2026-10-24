import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import TripForm from './TripForm'

vi.mock('../api/client', () => ({ api: { places: vi.fn().mockResolvedValue({ results: [] }) } }))

describe('TripForm', () => {
  it('does not send an incomplete trip, and says what is missing', async () => {
    const onSubmit = vi.fn()
    render(<TripForm onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: /plan trip/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getAllByText('Pick a place from the list.')).toHaveLength(2)
  })

  it('plans a sample trip in one click, as the API expects it', async () => {
    const onSubmit = vi.fn()
    render(<TripForm onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: /Chicago → Denver/ }))
    expect(onSubmit).toHaveBeenCalledWith({
      origin: { label: 'Chicago, IL', lat: 41.85003, lon: -87.65005 },
      destination: { label: 'Denver, CO', lat: 39.73915, lon: -104.9847 },
      departure: expect.any(String),
      load_lb: 45_000,
      interval_mi: 25,
    })
    // the next whole hour on the viewer's clock
    const leaves = new Date(onSubmit.mock.calls[0][0].departure)
    expect(leaves.getMinutes()).toBe(0)
    expect(leaves.getTime() - Date.now()).toBeGreaterThan(0)
    expect(leaves.getTime() - Date.now()).toBeLessThanOrEqual(3600_000)
  })
})
