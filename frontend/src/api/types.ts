// The shapes the Django API sends and accepts (backend/trips/planner.py, serializers.py, views.py).
// Times are ISO strings in UTC; each one comes with the IANA time zone of its place.

export type Level = 'low' | 'moderate' | 'high' | 'severe' | 'no_travel'
export type Cause = 'wind' | 'rain' | 'snow'

export interface Place {
  label: string
  lat: number
  lon: number
}

export interface PlaceResult extends Place {
  kind: string // 'town' from the local list; an OpenStreetMap type ('industrial', 'aerodrome', ...) from search
}

export interface PlanRequest {
  origin: Place
  destination: Place
  departure: string // ISO with offset, from an hour ago to 7 days ahead
  load_lb: number // 0 to 80,000
  interval_mi: 10 | 25 | 50
  rest_breaks?: boolean
}

export interface Checkpoint {
  mile: number
  lon: number
  lat: number
  eta: string
  time_zone: string
  hours_after_departure: number
  long_range: boolean // forecast more than 72 h ahead
  wind_mph: number
  gust_mph: number
  rain_in_hr: number
  snow_in_hr: number
  level: Level
  causes: Cause[]
  load_raised_wind: boolean
  reason: string // e.g. 'High: wind 38.0 mph'
}

export interface RestStop {
  mile: number
  lon: number
  lat: number
  starts: string
  time_zone: string
  minutes: number
  kind: 'break' | 'rest' // 30 min after 8 h of driving, 10 h after 11 h
}

export interface Stretch {
  start_mi: number
  end_mi: number
  level: Level
}

export interface Route {
  id: 'A' | 'B' | 'C'
  via: string
  router: 'valhalla' | 'osrm'
  distance_mi: number
  drive_seconds: number
  travel_seconds: number // driving plus rest stops
  arrival: string
  arrival_time_zone: string
  rank: number
  recommended: boolean
  not_chosen: string | null
  exposure: { miles: Record<Level, number>; average_risk: number }
  stretches: Stretch[]
  checkpoints: Checkpoint[]
  rest_stops: RestStop[]
  line: [lon: number, lat: number, mile: number][]
}

export interface Plan {
  trip: Required<PlanRequest>
  routes: Route[]
  recommendation: { route_id: Route['id']; reason: string; warning: string | null }
  notes: string[]
  meta: { weather_grid_miles: number; timings_ms: Record<string, number> }
}

export type ErrorCode =
  | 'invalid_request'
  | 'no_route'
  | 'routing_unavailable'
  | 'weather_unavailable'
  | 'weather_busy'
  | 'network' // no answer at all (offline, server down)
  | (string & {}) // DRF's own codes, e.g. 'parse_error'

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; fields?: Record<string, unknown>; retry_after?: number }
}
