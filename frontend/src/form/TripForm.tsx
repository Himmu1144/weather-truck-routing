import { Box, Button, ToggleButton, ToggleButtonGroup, TextField, Typography } from '@mui/material'
import { useState, type FormEvent } from 'react'
import type { PlaceResult, PlanRequest } from '../api/types'
import { DEPARTURE_EARLIEST_MS, DEPARTURE_LATEST_MS, nextHour, toLocalInput, viewerZone } from '../lib/time'
import { ease, ink } from '../theme'
import Eyebrow from '../ui/Eyebrow'
import FieldLabel from '../ui/FieldLabel'
import { ArrowIcon } from '../ui/icons'
import PlaceField from './PlaceField'
import { check, type Errors } from './check'
import { SAMPLES } from './samples'

type Interval = PlanRequest['interval_mi']

const toPlace = ({ label, lat, lon }: PlaceResult) => ({ label, lat, lon })
const digits = (text: string) => text.replace(/\D/g, '').slice(0, 6)
const withCommas = (text: string) => (text ? Number(text).toLocaleString('en-US') : '')

interface Props {
  onSubmit: (request: PlanRequest) => void
  serverErrors?: Errors // fields the server refused
}

export default function TripForm({ onSubmit, serverErrors = {} }: Props) {
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
    onSubmit({ origin: toPlace(o), destination: toPlace(d), departure: new Date(when).toISOString(), load_lb: Number(pounds), interval_mi: every })
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
      <Typography variant="h1" sx={{ mb: 1.5, textWrap: 'balance' }}>The safest road for this load, at the hour you drive it.</Typography>
      <Typography sx={{ color: ink[2], fontSize: 14, mb: 3.5, textWrap: 'pretty' }}>
        Three truck routes, the forecast at every checkpoint for the moment the truck gets there, and one clear pick.
      </Typography>

      <PlaceField id="origin" label="From" placeholder="City, address, port or ZIP" value={origin}
        onChange={p => { setOrigin(p); setErrors(e => ({ ...e, origin: undefined })) }} error={errors.origin ?? serverErrors.origin} />
      <PlaceField id="destination" label="To" placeholder="Where is the load going?" value={destination}
        onChange={p => { setDestination(p); setErrors(e => ({ ...e, destination: undefined })) }} error={errors.destination ?? serverErrors.destination} />

      <Box sx={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 2.25, mb: 2.5 }}>
        <Box>
          <FieldLabel htmlFor="departure">Departs · your time</FieldLabel>
          <TextField id="departure" type="datetime-local" variant="standard" fullWidth value={departure}
            onChange={e => setDeparture(e.target.value)} error={Boolean(errors.departure ?? serverErrors.departure)} helperText={errors.departure ?? serverErrors.departure ?? viewerZone()}
            slotProps={{ htmlInput: { min: bounds.min, max: bounds.max, step: 300 } }} />
        </Box>
        <Box>
          <FieldLabel htmlFor="load">Load (lb)</FieldLabel>
          <TextField id="load" variant="standard" fullWidth value={withCommas(load)} placeholder="40,000"
            onChange={e => setLoad(digits(e.target.value))} error={Boolean(errors.load_lb ?? serverErrors.load_lb)} helperText={errors.load_lb ?? serverErrors.load_lb}
            slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off' } }} />
        </Box>
      </Box>

      <FieldLabel>Weather every</FieldLabel>
      <ToggleButtonGroup exclusive fullWidth value={every} onChange={(_, v: Interval | null) => v && setEvery(v)}
        aria-label="Checkpoint interval"
        sx={{
          mt: 0.75, mb: 3.25, p: '3px', bgcolor: 'rgba(11,11,13,.05)', borderRadius: '11px',
          '& .MuiToggleButton-root': {
            border: 0, borderRadius: '8px !important', py: 0.75, fontSize: 13, color: ink[2], textTransform: 'none',
            transition: `all .25s ${ease}`,
          },
          '& .Mui-selected': { bgcolor: '#fff !important', color: `${ink.main} !important`, fontWeight: 500, boxShadow: '0 1px 3px rgba(16,24,40,.1), 0 0 0 1px rgba(11,11,13,.07)' },
        }}>
        {([10, 25, 50] as const).map(v => <ToggleButton key={v} value={v}>{v} mi</ToggleButton>)}
      </ToggleButtonGroup>

      <Button type="submit" variant="contained" fullWidth endIcon={<ArrowIcon />}
        sx={{ height: 50, fontSize: 14.5, boxShadow: '0 10px 24px -10px rgba(11,11,13,.55)', transition: `transform .3s ${ease}`, '&:hover': { transform: 'translateY(-1px)' } }}>
        Plan trip
      </Button>

      <Box sx={{ mt: 4 }}>
        <Eyebrow>Or try</Eyebrow>
        {SAMPLES.map(s => (
          <Box key={s.note} component="button" type="button" onClick={() => sample(s)}
            sx={{
              all: 'unset', boxSizing: 'border-box', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              py: 1.6, borderTop: '1px solid rgba(11,11,13,.07)', cursor: 'pointer', '&:last-of-type': { borderBottom: '1px solid rgba(11,11,13,.07)' },
              '& svg': { color: ink[3], transition: `transform .35s ${ease}` }, '&:hover svg, &:focus-visible svg': { transform: 'translateX(4px)', color: ink.main },
            }}>
            <span>
              <Typography sx={{ fontWeight: 500, fontSize: 14 }}>{s.origin.label.split(',')[0]} → {s.destination.label.split(',')[0]}</Typography>
              <Typography variant="caption">{s.note} · {s.load_lb.toLocaleString('en-US')} lb</Typography>
            </span>
            <ArrowIcon />
          </Box>
        ))}
      </Box>
    </Box>
  )
}
