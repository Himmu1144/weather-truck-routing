import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Plan } from '../api/types'
import { HeatUnavailable } from '../heat/weather'
import storm from '../test/fixtures/storm-plan.json'
import TimeBar from './TimeBar'

const plan = storm as unknown as Plan
const route = plan.routes.find(r => r.id === 'B')!
const bar = (props: Partial<Parameters<typeof TimeBar>[0]> = {}) => {
  const all = { route, departure: plan.trip.departure, loadLb: 45_000, hour: 0, onHour: vi.fn(), view: 'risk' as const, onView: vi.fn(),
    heat: { status: 'loading' as const }, onRetryHeat: vi.fn(), ...props }
  render(<TimeBar {...all} />)
  return all
}

describe('TimeBar', () => {
  it('reads the time where the truck is, and marks departure, arrival and each local midnight', () => {
    bar({ hour: 11 })
    expect(screen.getByText('Sat 7:00 PM')).toBeInTheDocument()
    expect(screen.getByText(/CDT · \+11 h · truck at mile 654/)).toBeInTheDocument()
    for (const mark of ['Depart', 'Arrive', 'Sun', '+48 h']) expect(screen.getByText(mark)).toBeInTheDocument()
  })

  it('moves the hour when the slider moves', () => {
    const { onHour } = bar()
    fireEvent.change(screen.getByRole('slider', { name: 'Hours after departure' }), { target: { value: '20.5' } })
    expect(onHour).toHaveBeenCalledWith(20.5)
  })

  it('switches the view, and the legend gives that view’s thresholds', async () => {
    const { onView } = bar({ view: 'wind', heat: { status: 'ready', grid: {} as never, weather: {} as never } })
    expect(screen.getByText('mph: 25 · 35 · 45 · 55')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Snow' }))
    expect(onView).toHaveBeenCalledWith('snow')
  })

  it('says while the weather layer is loading', () => {
    bar()
    expect(screen.getByText('Loading the weather layer…')).toBeInTheDocument()
  })

  it('offers a retry when the weather layer failed, and the plan is unaffected', async () => {
    const { onRetryHeat } = bar({ heat: { status: 'failed', error: new HeatUnavailable('The free weather service is busy.', true) } })
    expect(screen.getByText(/busy\. The plan above is unaffected\./)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetryHeat).toHaveBeenCalled()
  })
})
