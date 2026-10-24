import { Box, Button, ButtonBase, IconButton, Switch, ToggleButton, ToggleButtonGroup, TextField, Tooltip, Typography } from '@mui/material'
import { useState, type FormEvent } from 'react'
import type { PlaceResult, PlanRequest } from '../api/types'
import { DEPARTURE_EARLIEST_MS, DEPARTURE_LATEST_MS, nextHour, toLocalInput, viewerZone } from '../lib/time'
import { ease, ink } from '../theme'
import Eyebrow from '../ui/Eyebrow'
import FieldLabel from '../ui/FieldLabel'
import { ArrowIcon, InfoIcon } from '../ui/icons'
import PlaceField from './PlaceField'
import { check, type Errors } from './check'
import { SAMPLES } from './samples'

type Interval = PlanRequest['interval_mi']

const toPlace = ({ label, lat, lon }: PlaceResult) => ({ label, lat, lon })
const digits = (text: string) => text.replace(/\D/g, '').slice(0, 6)
const withCommas = (text: string) => (text ? Number(text).toLocaleString('en-US') : '')

interface Props {
  onSubmit: (request: PlanRequest) => void
  restBreaks: boolean // kept by the app, so the results' switch and this one agree
  onRestBreaks: (on: boolean) => void
  serverErrors?: Errors // fields the server refused
}

export default function TripForm({ onSubmit, restBreaks, onRestBreaks, serverErrors = {} }: Props) {
  const [origin, setOrigin] = useState<PlaceResult | null>(null)
  const [destination, setDestination] = useState<PlaceResult | null>(null)
  const [departure, setDeparture] = useState(() => toLocalInput(nextHour()))
  const [load, setLoad] = useState('40000')
  const [every, setEvery] = useState<Interval>(25)
  const [errors, setErrors] = useState<Errors>({})
  const [bounds] = useState(() => ({
    min: toLocalInput(new Date(Date.now() + DEPARTURE_EARLIEST_MS)),
    max: toLocalInput(new Date(Date.now() + DEPARTURE_LATEST_MS)),
  }))

  function send(o: PlaceResult | null, d: PlaceResult | null, when: string, pounds: string) {
    const found = check(o, d, when, pounds)
    setErrors(found)
    if (Object.keys(found).length || !o || !d) return
    onSubmit({ origin: toPlace(o), destination: toPlace(d), departure: new Date(when).toISOString(), load_lb: Number(pounds), interval_mi: every, rest_breaks: restBreaks })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    send(origin, destination, departure, load)
  }

  function sample(s: (typeof SAMPLES)[number]) {
    const when = toLocalInput(nextHour())
    setOrigin(s.origin); setDestination(s.destination); setDeparture(when); setLoad(String(s.load_lb))
    send(s.origin, s.destination, when, String(s.load_lb))
  }

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <Eyebrow>Weather-aware truck routing</Eyebrow>
      <Typography variant="h1" sx={{ fontSize: 26, mb: 3, textWrap: 'balance' }}>The safest road for this load, at the hour you drive it.</Typography>

      <PlaceField id="origin" label="From" placeholder="City, address, port or ZIP" value={origin}
        onChange={p => { setOrigin(p); setErrors(e => ({ ...e, origin: undefined })) }} error={errors.origin ?? serverErrors.origin} />
      <PlaceField id="destination" label="To" placeholder="Where is the load going?" value={destination}
        onChange={p => { setDestination(p); setErrors(e => ({ ...e, destination: undefined })) }} error={errors.destination ?? serverErrors.destination} />

      <Box sx={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 2.25, mb: 2.25 }}>
        <Box>
          <FieldLabel htmlFor="departure">Departs · {viewerZone()}</FieldLabel>
          <TextField id="departure" type="datetime-local" variant="standard" fullWidth value={departure}
            onChange={e => setDeparture(e.target.value)} error={Boolean(errors.departure ?? serverErrors.departure)} helperText={errors.departure ?? serverErrors.departure}
            slotProps={{ htmlInput: { min: bounds.min, max: bounds.max, step: 300 } }} />
        </Box>
        <Box>
          <FieldLabel htmlFor="load">Load (lb)</FieldLabel>
          <TextField id="load" variant="standard" fullWidth value={withCommas(load)} placeholder="40,000"
            onChange={e => setLoad(digits(e.target.value))} error={Boolean(errors.load_lb ?? serverErrors.load_lb)} helperText={errors.load_lb ?? serverErrors.load_lb}
            slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off' } }} />
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', gap: 2, mb: 1.5 }}>
        <FieldLabel>Weather every</FieldLabel>
        <ToggleButtonGroup exclusive fullWidth value={every} onChange={(_, v: Interval | null) => v && setEvery(v)}
          aria-label="Checkpoint interval"
          sx={{
            p: '3px', bgcolor: 'rgba(11,11,13,.05)', borderRadius: '11px',
            '& .MuiToggleButton-root': {
              border: 0, borderRadius: '8px !important', py: 0.6, fontSize: 13, color: ink[2], textTransform: 'none',
              transition: `all .25s ${ease}`,
            },
            '& .Mui-selected': { bgcolor: '#fff !important', color: `${ink.main} !important`, fontWeight: 500, boxShadow: '0 1px 3px rgba(16,24,40,.1), 0 0 0 1px rgba(11,11,13,.07)' },
          }}>
          {([10, 25, 50] as const).map(v => <ToggleButton key={v} value={v}>{v} mi</ToggleButton>)}
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: restBreaks ? 2.25 : 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography component="label" htmlFor="rest-breaks" sx={{ fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>Legal rest breaks</Typography>
          <Tooltip enterTouchDelay={0} leaveTouchDelay={6000} placement="top"
            title="US hours-of-service rules: a 30-min break after 8 h of driving, and 10 h off duty when the 11-h daily driving limit is reached. Both are included in the ETAs.">
            <IconButton size="small" aria-label="About legal rest breaks" sx={{ color: ink[3], p: 0.5 }}><InfoIcon /></IconButton>
          </Tooltip>
        </Box>
        <Switch id="rest-breaks" checked={restBreaks} onChange={e => onRestBreaks(e.target.checked)} slotProps={{ input: { 'aria-label': 'Legal rest breaks' } }}
          sx={{ '& .Mui-checked + .MuiSwitch-track': { bgcolor: `${ink.main} !important`, opacity: '1 !important' }, '& .Mui-checked .MuiSwitch-thumb': { color: '#fff' } }} />
      </Box>
      {!restBreaks && <Typography variant="caption" component="p" sx={{ mb: 2.25 }}>Off: ETAs assume non-stop driving</Typography>}

      <Button type="submit" variant="contained" fullWidth endIcon={<ArrowIcon />}
        sx={{ height: 50, fontSize: 14.5, boxShadow: '0 10px 24px -10px rgba(11,11,13,.55)', transition: `transform .3s ${ease}`, '&:hover': { transform: 'translateY(-1px)' } }}>
        Plan trip
      </Button>

      {/* Or one click on a sample trip: the quickest way to see what the app does */}
      <Typography variant="overline" component="p" sx={{ fontSize: 10, letterSpacing: '.14em', mt: 2.5, mb: 0.75 }}>Or try a sample</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
        {SAMPLES.map(s => (
          <Tooltip key={s.note} describeChild title={`${s.note} · ${s.load_lb.toLocaleString('en-US')} lb`} placement="bottom">
            <ButtonBase onClick={() => sample(s)} sx={{
              px: 1.1, py: 0.5, borderRadius: 99, fontSize: 12.5, color: ink.main, border: `1px solid rgba(11,11,13,.13)`,
              transition: `all .25s ${ease}`, '&:hover': { bgcolor: ink.main, color: '#fff', borderColor: ink.main },
            }}>
              {s.name}
            </ButtonBase>
          </Tooltip>
        ))}
      </Box>
    </Box>
  )
}
