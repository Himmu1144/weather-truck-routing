import { Typography } from '@mui/material'
import type { RestStop } from '../api/types'
import { at } from '../lib/format'
import { ink } from '../theme'
import type { CardArea } from './geometry'
import MapCard from './MapCard'

/** A required stop: what it is, when it starts and ends in local time, and why it is there. */
export default function RestStopCard({ stop, x, y, area, onClose }: { stop: RestStop; x: number; y: number; area?: CardArea; onClose?: () => void }) {
  const ends = new Date(Date.parse(stop.starts) + stop.minutes * 60_000).toISOString()
  return (
    <MapCard x={x} y={y} area={area} label={`Rest stop at mile ${Math.round(stop.mile)}`} onClose={onClose}>
      <Typography sx={{ fontWeight: 600, fontSize: 13 }}>{stop.kind === 'rest' ? '10 h off duty' : '30 min break'}</Typography>
      <Typography variant="caption" component="p" sx={{ fontSize: 11.5, mt: 0.25, mb: 1 }}>Mile {Math.round(stop.mile)}</Typography>
      <Typography sx={{ fontSize: 12.5, color: ink.main }}>{at(stop.starts, stop.time_zone)} → {at(ends, stop.time_zone)}</Typography>
      <Typography variant="caption" component="p" sx={{ mt: 1, fontSize: 11.5, color: ink[2] }}>
        {stop.kind === 'rest' ? 'The 11-h daily driving limit was reached' : 'Required after 8 h of driving'} (US hours-of-service rules). The ETAs include it.
      </Typography>
    </MapCard>
  )
}
