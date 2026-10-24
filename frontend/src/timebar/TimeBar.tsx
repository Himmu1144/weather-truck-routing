import { Box, Button, ButtonBase, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import type { Route } from '../api/types'
import type { HeatView } from '../heat/layer'
import type { HeatState } from '../heat/useHeatWeather'
import { at, localTime } from '../lib/format'
import { ease, hairline, ink, LEVEL_NAMES, LEVELS, RISK } from '../theme'
import './timebar.css'
import { levelsInTime, midnights, SLIDER_HOURS, stopName, truckState, zoneAt } from './trip'

const PLAY_HOURS_PER_SECOND = 3
const SCALES: Record<HeatView, string> = {
  risk: '', wind: 'mph: 25 · 35 · 45 · 55', rain: 'in/hr: 0.10 · 0.25 · 0.50 · 1.00', snow: 'in/hr: 0.5 · 1 · 2 · 3',
}

interface Props {
  route: Route
  destination: string
  departure: string
  loadLb: number
  hour: number
  onHour: (hour: number) => void
  view: HeatView
  onView: (view: HeatView) => void
  heat: HeatState
  onRetryHeat: () => void
  compact?: boolean // a phone: the explanation on its own line, the colour key left out (the panel has it)
}

/** The forecast slider: 0 to 48 h from departure, the trip's span marked on it in the colours of
 *  the weather the truck meets, the clock in the local time of wherever the truck is. */
export default function TimeBar({ route, destination, departure, loadLb, hour, onHour, view, onView, heat, onRetryHeat, compact = false }: Props) {
  const [playing, setPlaying] = useState(false)
  const end = route.travel_seconds / 3600
  // Play plays the trip: it stops at arrival. Started after arrival, it plays the rest of the forecast.
  const stopAt = useRef(SLIDER_HOURS)
  const latest = useRef(hour)
  useEffect(() => { latest.current = hour }, [hour])

  useEffect(() => {
    if (!playing) return
    let frame = 0, last = performance.now()
    const step = (now: number) => {
      const next = latest.current + ((now - last) / 1000) * PLAY_HOURS_PER_SECOND
      last = now
      if (next >= stopAt.current) { onHour(stopAt.current); setPlaying(false); return }
      onHour(next)
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [playing, onHour])

  const zone = zoneAt(route, hour)
  const clock = localTime(new Date(Date.parse(departure) + hour * 3.6e6).toISOString(), zone)
  const truck = truckState(route, hour)
  const pct = (h: number) => `${(Math.min(h, SLIDER_HOURS) / SLIDER_HOURS) * 100}%`
  const ticks = [
    { hour: 0, text: 'Depart', trip: true },
    ...(end <= SLIDER_HOURS ? [{ hour: end, text: 'Arrive', trip: true }] : []),
    ...midnights(departure, route.checkpoints[0].time_zone).filter(m => Math.abs(m.hour - end) > 3 && m.hour > 2).map(m => ({ hour: m.hour, text: m.day, trip: false })),
    // past the end the trip's own "arrives +N h" label takes that corner
    ...(end < SLIDER_HOURS - 3 ? [{ hour: SLIDER_HOURS, text: '+48 h', trip: false }] : []),
  ]
  const note = (
    <Typography variant="caption" component="p" sx={{ fontSize: 11.5 }}>
      {clock.zone} · +{hour.toFixed(hour % 1 ? 1 : 0)} h · {
        truck.kind === 'driving' ? `truck at mile ${Math.round(truck.mile).toLocaleString('en-US')}`
          : truck.kind === 'stopped' ? `${stopName(truck.stop)} at mile ${Math.round(truck.mile)}, until ${at(truck.until, truck.stop.time_zone)}`
            : hour - end < 0.05 ? `arrived in ${destination.split(',')[0]}` : `arrived ${at(route.arrival, route.arrival_time_zone)}: forecast only from here`}
    </Typography>
  )

  return (
    <Box role="group" aria-label="Forecast time" sx={{
      p: compact ? '12px 14px 6px' : '16px 20px 12px', borderRadius: '18px', bgcolor: 'rgba(255,255,255,.86)', backdropFilter: 'blur(20px) saturate(1.6)',
      outline: `1px solid ${hairline}`, boxShadow: '0 1px 2px rgba(16,24,40,.04), 0 24px 56px -16px rgba(16,24,40,.25)',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: compact ? 1.25 : 2 }}>
        <ButtonBase onClick={() => {
          if (!playing) {
            const from = hour >= SLIDER_HOURS ? 0 : hour
            if (from !== hour) onHour(from)
            stopAt.current = from < end - 0.01 ? Math.min(end, SLIDER_HOURS) : SLIDER_HOURS
          }
          setPlaying(p => !p)
        }} aria-label={playing ? 'Pause' : 'Play'}
          sx={{ width: compact ? 34 : 38, height: compact ? 34 : 38, borderRadius: '50%', bgcolor: ink.main, color: '#fff', flex: 'none', transition: `transform .3s ${ease}`, '&:hover': { transform: 'scale(1.06)' } }}>
          {playing
            ? <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><rect x="2" y="1.5" width="2.8" height="9" rx="1" fill="currentColor" /><rect x="7.2" y="1.5" width="2.8" height="9" rx="1" fill="currentColor" /></svg>
            : <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden><path d="M3 1.8v8.4c0 .5.5.8.9.5l6.6-4.2c.4-.2.4-.8 0-1L3.9 1.3c-.4-.3-.9 0-.9.5z" fill="currentColor" /></svg>}
        </ButtonBase>
        <Box sx={{ minWidth: compact ? 0 : 160, flex: 1 }} aria-live="off">
          <Typography sx={{ fontFamily: '"Space Grotesk"', fontWeight: 500, fontSize: compact ? 16 : 19, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{clock.time}</Typography>
          {!compact && note}
        </Box>
        <Box role="tablist" aria-label="Heatmap shows" sx={{ ml: 'auto', display: 'flex', p: '3px', bgcolor: 'rgba(11,11,13,.05)', borderRadius: '10px' }}>
          {(['risk', 'wind', 'rain', 'snow'] as const).map(v => (
            <ButtonBase key={v} role="tab" aria-selected={view === v} onClick={() => onView(v)} sx={{
              px: compact ? 0.75 : 1.4, py: 0.6, borderRadius: '7px', fontSize: compact ? 11.5 : 12.5, color: view === v ? ink.main : ink[2], fontWeight: view === v ? 500 : 400,
              bgcolor: view === v ? '#fff' : 'transparent', boxShadow: view === v ? '0 1px 3px rgba(16,24,40,.1), 0 0 0 1px rgba(11,11,13,.07)' : 'none',
              transition: `all .25s ${ease}`,
            }}>{v[0].toUpperCase() + v.slice(1)}</ButtonBase>
          ))}
        </Box>
      </Box>

      {compact && <Box sx={{ mt: 0.75 }}>{note}</Box>}
      <Box sx={{ position: 'relative', height: 46, mt: compact ? 1 : 1.5 }}>
        <Box sx={{ position: 'absolute', left: 0, right: 0, top: 14, height: 2, bgcolor: 'rgba(11,11,13,.13)', borderRadius: 1 }} />
        {/* the trip, in the colours of the weather the truck meets */}
        <Box sx={{ position: 'absolute', top: 11, left: 0, width: pct(end), height: 8, borderRadius: 4, display: 'flex', overflow: 'hidden', boxShadow: '0 0 0 2px #fff' }}>
          {levelsInTime(route).filter(s => s.from < SLIDER_HOURS).map(s => (
            <Box key={s.from} sx={{ flex: Math.min(s.to, SLIDER_HOURS) - s.from, bgcolor: s.level === 'low' ? '#9fb9bc' : RISK[s.level] }} />
          ))}
        </Box>
        {ticks.map(t => (
          <Typography key={`${t.text}-${t.hour}`} variant="caption" sx={{
            position: 'absolute', top: 24, left: pct(t.hour), transform: 'translateX(-50%)', fontSize: 10.5, whiteSpace: 'nowrap',
            color: t.trip ? ink[2] : ink[3], fontWeight: t.trip ? 500 : 400,
            '&::before': { content: '""', position: 'absolute', left: '50%', top: t.trip ? -14 : -12, width: '1px', height: t.trip ? 9 : 7, bgcolor: t.trip ? ink.main : ink[4] },
          }}>{t.text}</Typography>
        ))}
        {end > SLIDER_HOURS && (
          <Typography variant="caption" sx={{ position: 'absolute', top: 24, right: 0, fontSize: 10.5, color: ink[2], fontWeight: 500 }}>
            arrives +{Math.round(end)} h →
          </Typography>
        )}
        <input className="tw-range" type="range" min={0} max={SLIDER_HOURS} step={0.05} value={hour} aria-label="Hours after departure"
          aria-valuetext={`${clock.time} ${clock.zone}, ${Math.round(hour)} hours after departure`}
          onChange={e => { setPlaying(false); onHour(Number(e.target.value)) }} />
      </Box>

      {(!compact || heat.status !== 'ready' || view !== 'risk') && <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', minHeight: 22, mb: compact ? 0.75 : 0 }}>
        {!compact && LEVELS.map(l => (
          <Box key={l} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: 11.5, color: ink[2] }}>
            <Box sx={{ width: 9, height: 9, borderRadius: '3px', bgcolor: RISK[l] }} />{LEVEL_NAMES[l]}
          </Box>
        ))}
        <Box sx={{ ml: compact ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
          {heat.status === 'loading' && <Typography variant="caption" sx={{ fontSize: 11.5 }}>Loading the weather layer…</Typography>}
          {heat.status === 'failed' && (
            <>
              <Typography variant="caption" sx={{ fontSize: 11.5, color: ink[2] }}>{heat.error.message} The plan itself is unaffected.</Typography>
              <Button size="small" onClick={onRetryHeat} sx={{ minWidth: 0, py: 0, fontSize: 11.5 }}>Retry</Button>
            </>
          )}
          {heat.status === 'ready' && (
            <Typography variant="caption" sx={{ fontSize: 11.5 }}>{view === 'risk' ? `${loadLb.toLocaleString('en-US')} lb load applied` : SCALES[view]}</Typography>
          )}
        </Box>
      </Box>}
    </Box>
  )
}
