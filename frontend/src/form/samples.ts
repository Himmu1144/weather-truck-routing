import type { PlaceResult } from '../api/types'

const town = (label: string, lat: number, lon: number): PlaceResult => ({ label, lat, lon, kind: 'town' })

// Trips that show the app's range: the Plains in one day, the South, and one that runs past 48 h.
export const SAMPLES = [
  { origin: town('Chicago, IL', 41.85003, -87.65005), destination: town('Denver, CO', 39.73915, -104.9847), load_lb: 45_000, name: 'Chicago → Denver', note: '1,000 mi across the Plains' },
  { origin: town('Dallas, TX', 32.78306, -96.80667), destination: town('Atlanta, GA', 33.749, -84.38798), load_lb: 38_000, name: 'Dallas → Atlanta', note: '800 mi through the South' },
  { origin: town('Los Angeles, CA', 34.05223, -118.24368), destination: town('Chicago, IL', 41.85003, -87.65005), load_lb: 42_000, name: 'LA → Chicago', note: 'Los Angeles to Chicago, 2,000 mi, runs past 48 h' },
]
