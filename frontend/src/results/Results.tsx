import { Box, ButtonBase, Typography } from '@mui/material'
import { memo } from 'react'
import type { Level, Plan, Route } from '../api/types'
import { at, duration, extra, localTime, miles } from '../lib/format'
import { ease, hairline, ink, LEVEL_NAMES, LEVELS, RISK } from '../theme'
import Eyebrow from '../ui/Eyebrow'
import { loadEffect, loadOnRoute } from './load'
import RiskStrip from './RiskStrip'
import { levelAfter, timeline, type Row } from './timeline'

interface Props {
  plan: Plan
  selected: Route['id']
  onSelect: (id: Route['id']) => void
  onFocus?: (mile: number) => void // show this mile of the selected route on the map
}

const worst = (route: Route): Level | undefined =>
  [...LEVELS].reverse().find(level => level !== 'low' && route.exposure.miles[level] > 0)
const exposureText = (route: Route) => {
  const level = worst(route)
  return level ? `${miles(route.exposure.miles[level])} ${LEVEL_NAMES[level]}` : 'Low the whole way'
}
const routerTag = (route: Route) => (route.router === 'valhalla' ? 'Truck route' : 'Car roads')

/** Memoised: the slider moves 60 times a second and the panel has no reason to redraw. */
export default memo(function Results({ plan, selected, onSelect, onFocus }: Props) {
  const recommended = plan.routes.find(r => r.id === plan.recommendation.route_id)!
  const route = plan.routes.find(r => r.id === selected)!
  const fastest = Math.min(...plan.routes.map(r => r.travel_seconds))
  const { trip } = plan
  const arrives = localTime(recommended.arrival, recommended.arrival_time_zone)
  const effectOnRoute = loadOnRoute(trip.load_lb, route)

  return (
    <Box>
      <Box sx={{ pb: 2.5, mb: 2.75, borderBottom: `1px solid ${hairline}` }}>
        <Typography sx={{ fontWeight: 600, fontSize: 15, letterSpacing: '-.01em' }}>
          {trip.origin.label}<Box component="span" sx={{ color: ink[3], mx: 0.75 }}>→</Box>{trip.destination.label}
        </Typography>
        <Typography variant="caption" component="p" sx={{ mt: 0.4, fontSize: 12.5 }}>
          Leaves {at(trip.departure, recommended.checkpoints[0].time_zone)} · {trip.load_lb.toLocaleString('en-US')} lb · weather every {trip.interval_mi} mi
        </Typography>
      </Box>

      {/* The answer first */}
      <Eyebrow>Recommended</Eyebrow>
      <Typography variant="h2">Route {recommended.id}</Typography>
      <Typography variant="body2" sx={{ color: ink[3], mt: 1, mb: 2.5 }}>
        via {recommended.via} <Tag>{routerTag(recommended)}</Tag>
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr .8fr', gap: 1.5, mb: 2.25 }}>
        <Stat label="Arrives" value={arrives.time} note={`${arrives.zone} · with rest stops`} />
        <Stat label="On the road" value={duration(recommended.travel_seconds)} note={`${duration(recommended.drive_seconds)} driving`} />
        <Stat label="Distance" value={miles(recommended.distance_mi)} />
      </Box>
      <Typography variant="body2" sx={{ color: ink[2], mb: 2, textWrap: 'pretty' }}>{plan.recommendation.reason}</Typography>
      {plan.recommendation.warning && <Note>{plan.recommendation.warning}</Note>}
      <RiskStrip route={recommended} />
      <Typography variant="caption" component="p" sx={{ mt: 0.75 }}>
        {[...LEVELS].reverse().filter(l => recommended.exposure.miles[l] > 0)
          .map(l => `${miles(recommended.exposure.miles[l])} ${LEVEL_NAMES[l]}`).join(' · ')}
      </Typography>

      {/* Every route, the selected one shown on the map */}
      <Box sx={{ mt: 4 }}>
        <Eyebrow>{plan.routes.length === 3 ? 'All three routes' : `All ${plan.routes.length} routes`}</Eyebrow>
        {[...plan.routes].sort((a, b) => a.rank - b.rank).map(r => (
          <ButtonBase key={r.id} onClick={() => onSelect(r.id)} aria-pressed={r.id === selected}
            sx={{
              display: 'grid', gridTemplateColumns: '26px 1fr auto', columnGap: 1.5, rowGap: 0.4, alignItems: 'center', textAlign: 'left',
              width: 'calc(100% + 24px)', mx: '-12px', p: 1.5, borderRadius: '12px', transition: `background .25s ${ease}`,
              bgcolor: r.id === selected ? 'rgba(11,11,13,.055)' : 'transparent', '&:hover': { bgcolor: 'rgba(11,11,13,.035)' },
            }}>
            <Box sx={{
              width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontFamily: '"Space Grotesk"', fontWeight: 600, fontSize: 12,
              border: `1px solid ${r.id === selected ? ink.main : 'rgba(11,11,13,.13)'}`, bgcolor: r.id === selected ? ink.main : 'transparent',
              color: r.id === selected ? '#fff' : ink[2], transition: `all .25s ${ease}`,
            }}>{r.id}</Box>
            <Typography sx={{ fontWeight: 500, fontSize: 14, minWidth: 0 }} noWrap>
              Route {r.id}<Box component="span" sx={{ color: ink[3], fontWeight: 400, ml: 0.75, fontSize: 12.5 }}>{r.via}</Box>
            </Typography>
            <Typography sx={{ fontFamily: '"Space Grotesk"', fontWeight: 500, fontSize: 15 }}>{duration(r.travel_seconds)}</Typography>
            <Box sx={{ gridColumn: '2 / 4', display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" sx={{ color: worst(r) ? ink[2] : ink[3] }}>
                {exposureText(r)}{r.recommended && ' · recommended'}
              </Typography>
              <Typography variant="caption">
                {r.travel_seconds - fastest < 60 ? 'Fastest' : extra(r.travel_seconds - fastest)}{r.router === 'osrm' && ' · car roads'}
              </Typography>
            </Box>
            <Box sx={{ gridColumn: '2 / 4', mt: 0.5 }}><RiskStrip route={r} height={3} /></Box>
          </ButtonBase>
        ))}
        {route.not_chosen && (
          <Typography variant="body2" sx={{ color: ink[2], mt: 1.5, fontSize: 12.5 }}>
            Route {route.id} not chosen: {route.not_chosen}
          </Typography>
        )}
      </Box>

      {/* What the driver meets on the selected route */}
      <Box sx={{ mt: 4 }}>
        <Eyebrow>Along route {route.id}</Eyebrow>
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {timeline(route).map((row, i, rows) => <TimelineRow key={`${row.kind}-${row.mile}`} row={row} rail={RISK[levelAfter(rows, i)]} last={i === rows.length - 1} plan={plan} onFocus={onFocus} />)}
        </Box>
        <Note>
          <b>{trip.load_lb.toLocaleString('en-US')} lb load.</b> {loadEffect(trip.load_lb)} {effectOnRoute}
        </Note>
      </Box>

      {plan.notes.length > 0 && (
        <Box sx={{ mt: 3, pt: 2, borderTop: `1px solid ${hairline}`, display: 'grid', gap: 0.75 }}>
          {plan.notes.map(n => <Typography key={n} variant="caption">{n}</Typography>)}
        </Box>
      )}
    </Box>
  )
})

function TimelineRow({ row, rail, last, plan, onFocus }: { row: Row; rail: string; last: boolean; plan: Plan; onFocus?: (mile: number) => void }) {
  let dot = ink.main, title: React.ReactNode, when = '', meta = ''
  switch (row.kind) {
    case 'depart':
    case 'arrive':
      title = <>{row.kind === 'depart' ? 'Depart' : 'Arrive'} <Light>{(row.kind === 'depart' ? plan.trip.origin : plan.trip.destination).label}</Light></>
      when = at(row.at, row.zone)
      break
    case 'calm':
      dot = RISK.low
      title = <Light>{row.count} checkpoint{row.count > 1 ? 's' : ''} Low · mile {Math.round(row.mile)}–{Math.round(row.to)}</Light>
      break
    case 'rest':
      title = <>{row.stop.kind === 'rest' ? '10 h rest' : '30 min break'} <Light>· mile {Math.round(row.mile)}</Light></>
      when = at(row.stop.starts, row.stop.time_zone)
      meta = row.stop.kind === 'rest' ? 'Required after 11 h of driving' : 'Required after 8 h of driving'
      break
    case 'checkpoint': {
      const c = row.checkpoint, [level, ...cause] = c.reason.split(': ')
      dot = RISK[c.level]
      title = <>{level}: <Light>{cause.join(': ')}</Light></>
      when = at(c.eta, c.time_zone)
      meta = `Mile ${Math.round(c.mile)}${c.long_range ? ' · forecast more than 72 h ahead, less certain' : ''}`
    }
  }
  return (
    <Box component="li" sx={{ position: 'relative', pb: last ? 0 : 2 }}>
      {!last && <Box sx={{ position: 'absolute', left: 8, top: 14, bottom: -2, width: 2, borderRadius: 1, bgcolor: rail === RISK.low ? ink[4] : rail }} />}
      <ButtonBase onClick={() => onFocus?.(row.mile)} disabled={!onFocus} aria-label={`Show mile ${Math.round(row.mile)} on the map`}
        sx={{ display: 'grid', gridTemplateColumns: '18px 1fr auto', columnGap: 1.5, width: 1, textAlign: 'left', alignItems: 'start', borderRadius: '6px',
          '&:hover .tw-title': { textDecoration: 'underline', textDecorationColor: 'rgba(11,11,13,.25)', textUnderlineOffset: '3px' } }}>
        <Box sx={{ width: 18, height: 18, display: 'grid', placeItems: 'center', mt: '1px' }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dot, boxShadow: '0 0 0 3px #fff', position: 'relative' }} />
        </Box>
        <Typography className="tw-title" sx={{ fontSize: 13, fontWeight: 500 }}>{title}</Typography>
        <Typography variant="caption" sx={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{when}</Typography>
        {meta && <Typography variant="caption" sx={{ gridColumn: '2 / 4' }}>{meta}</Typography>}
      </ButtonBase>
    </Box>
  )
}

const Light = ({ children }: { children: React.ReactNode }) => <Box component="span" sx={{ fontWeight: 400, color: ink[2] }}>{children}</Box>

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Box>
      <Typography variant="overline" component="div" sx={{ fontSize: 10, letterSpacing: '.14em', lineHeight: 1.6 }}>{label}</Typography>
      <Typography sx={{ fontFamily: '"Space Grotesk"', fontWeight: 500, fontSize: 17, lineHeight: 1.2 }}>{value}</Typography>
      {note && <Typography variant="caption" component="div" sx={{ fontSize: 11.5, mt: 0.25 }}>{note}</Typography>}
    </Box>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <Box component="span" sx={{ ml: 0.75, px: 0.9, py: '1px', border: '1px solid rgba(11,11,13,.13)', borderRadius: 99, fontSize: 10, fontWeight: 600,
      letterSpacing: '.1em', textTransform: 'uppercase', color: ink[3], verticalAlign: '1px' }}>{children}</Box>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ mt: 2, mb: 2, p: '12px 14px', borderRadius: '12px', bgcolor: 'rgba(11,11,13,.035)', fontSize: 12.5, color: ink[2], '& b': { fontWeight: 500, color: ink.main } }}>
      {children}
    </Box>
  )
}
