import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { PlaceResult } from '../api/types'
import PlaceField from './PlaceField'

vi.mock('../api/client', () => ({ api: { places: vi.fn() } }))
const places = vi.mocked(api.places)

const town = (label: string): PlaceResult => ({ label, lat: 39.7, lon: -105, kind: 'town' })
const address = (label: string): PlaceResult => ({ label, lat: 39.86, lon: -104.67, kind: 'aerodrome' })

function field(onChange = vi.fn()) {
  render(<PlaceField id="origin" label="From" placeholder="City" value={null} onChange={onChange} />)
  return { input: screen.getByRole('combobox'), onChange }
}

describe('PlaceField', () => {
  beforeEach(() => { places.mockReset() })

  it('shows towns at once and addresses when the online search answers, in two groups', async () => {
    let answer!: (value: { results: PlaceResult[] }) => void
    places.mockImplementation((_q, source) => source === 'towns'
      ? Promise.resolve({ results: [town('Denver, CO'), town('Denton, TX')] })
      : new Promise(resolve => { answer = resolve }))
    const { input } = field()
    await userEvent.type(input, 'den')

    expect(await screen.findByText('Towns')).toBeInTheDocument()
    expect(screen.queryByText('Addresses, ports and ZIP codes')).not.toBeInTheDocument()

    await vi.waitFor(() => expect(places).toHaveBeenCalledWith('den', 'search', expect.anything()))
    answer({ results: [address('Denver International Airport, 8500 Peña Blvd, Denver, CO 80249'), town('Denver, CO')] })
    expect(await screen.findByText('Addresses, ports and ZIP codes')).toBeInTheDocument()
    expect(screen.getByText('Denver International Airport')).toBeInTheDocument()
    expect(screen.getAllByText('Denver')).toHaveLength(1)   // the same town from both searches is listed once
  })

  it('asks the online search only once typing pauses', async () => {
    places.mockResolvedValue({ results: [] })
    const { input } = field()
    await userEvent.type(input, 'port of long')
    await vi.waitFor(() => expect(places).toHaveBeenCalledWith('port of long', 'search', expect.anything()))
    expect(places.mock.calls.filter(([, source]) => source === 'search')).toHaveLength(1)
  })

  it('says when the online search is down, and towns still work', async () => {
    places.mockImplementation((_q, source) => Promise.resolve(source === 'towns'
      ? { results: [town('Long Beach, CA')] }
      : { results: [], unavailable: true }))
    const { input, onChange } = field()
    await userEvent.type(input, 'long b')
    expect(await screen.findByText('Address search isn’t answering right now. Towns still work.')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Long Beach'))
    expect(onChange).toHaveBeenCalledWith(town('Long Beach, CA'))
  })
})
