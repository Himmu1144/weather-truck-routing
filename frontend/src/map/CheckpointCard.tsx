import { Box, Typography } from '@mui/material'
import type { Checkpoint } from '../api/types'
import { at } from '../lib/format'
import { ink, RISK } from '../theme'
import type { CardArea } from './geometry'
import MapCard from './MapCard'

interface Props {
  checkpoint: Checkpoint
  x: number
  y: number
  area?: CardArea
  onClose?: () => void // set when the card is pinned (clicked or tapped)
}

/** One checkpoint, read off the map: when the truck is there, the weather then, and what it means. */
export default function CheckpointCard({ checkpoint: c, x, y, area, onClose }: Props) {
  const [level, ...cause] = c.reason.split(': ')
  // the reading that set the level is in bold
  const rows: [string, string, boolean][] = [
    ['Wind', `${c.wind_mph.toFixed(1)} mph`, c.causes.includes('wind')],
    ['Gusts', `${c.gust_mph.toFixed(1)} mph`, false],
    ['Rain', `${c.rain_in_hr.toFixed(2)} in/hr`, c.causes.includes('rain')],
    ['Snow', `${c.snow_in_hr.toFixed(1)} in/hr`, c.causes.includes('snow')],
  ]
  return (
    <MapCard x={x} y={y} area={area} label={`Checkpoint at mile ${Math.round(c.mile)}`} onClose={onClose}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.9 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: RISK[c.level], boxShadow: c.level === 'low' ? 'inset 0 0 0 1px rgba(0,0,0,.15)' : 'none' }} />
        <Typography sx={{ fontWeight: 600, fontSize: 13 }}>{level}</Typography>
      </Box>
      <Typography variant="caption" component="p" sx={{ fontSize: 11.5, mt: 0.25, mb: 1 }}>
        Mile {Math.round(c.mile)} · {at(c.eta, c.time_zone)} · +{c.hours_after_departure.toFixed(1)} h
      </Typography>
      <Box component="table" sx={{ width: 1, borderCollapse: 'collapse', fontSize: 12.5, color: ink[2], '& td': { py: '1px' }, '& td + td': { textAlign: 'right', color: ink.main } }}>
        <tbody>{rows.map(([k, v, isCause]) => <Box component="tr" key={k} sx={isCause ? { fontWeight: 600, '& td': { color: ink.main } } : undefined}><td>{k}</td><td>{v}</td></Box>)}</tbody>
      </Box>
      {c.load_raised_wind && <Typography variant="caption" component="p" sx={{ mt: 1, fontSize: 11.5, color: ink[2] }}>{cause.join(': ')}</Typography>}
      {c.long_range && <Typography variant="caption" component="p" sx={{ mt: 0.5, fontSize: 11 }}>Forecast more than 72 h ahead: less certain.</Typography>}
    </MapCard>
  )
}
