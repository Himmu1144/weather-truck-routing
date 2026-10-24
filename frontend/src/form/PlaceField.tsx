import { Autocomplete, Box, CircularProgress, TextField, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { PlaceResult } from '../api/types'
import FieldLabel from '../ui/FieldLabel'
import { PinIcon, TownIcon } from '../ui/icons'
import { ink } from '../theme'

const TOWNS = 'Towns'
const SEARCH = 'Addresses, ports and ZIP codes'
const SEARCH_DELAY_MS = 300 // the online search waits until typing pauses

interface Props {
  id: string
  label: string
  placeholder: string
  value: PlaceResult | null
  onChange: (place: PlaceResult | null) => void
  error?: string
}

/** Towns from the local list on every keystroke; addresses, ports and ZIP codes from the
 *  online search once typing pauses. If the online search is down, towns still work. */
export default function PlaceField({ id, label, placeholder, value, onChange, error }: Props) {
  const [input, setInput] = useState(value?.label ?? '')
  const [towns, setTowns] = useState<PlaceResult[]>([])
  const [found, setFound] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const pending = useRef<{ towns?: AbortController; search?: AbortController; timer?: number; last?: string }>({})

  const cancel = () => {
    const p = pending.current
    p.towns?.abort()
    p.search?.abort()
    clearTimeout(p.timer)
  }
  useEffect(() => cancel, [])

  // A sample trip sets the value from outside: show its label.
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    if (value) setInput(value.label)
  }

  function search(text: string) {
    cancel()
    const q = text.trim(), p = pending.current
    if (q.length < 2) {
      setTowns([]); setFound([]); setSearching(false); setUnavailable(false)
      return
    }
    p.towns = new AbortController()
    api.places(q, 'towns', p.towns.signal).then(r => setTowns(r.results), () => {})
    if (q.length < 3) {
      setFound([]); setSearching(false)
      return
    }
    // Keep the last addresses while the next answer is on its way, if they still fit the text.
    if (!p.last || !q.toLowerCase().startsWith(p.last.toLowerCase())) setFound([])
    setSearching(true)
    const controller = p.search = new AbortController()
    p.timer = window.setTimeout(() => {
      api.places(q, 'search', controller.signal).then(
        r => { p.last = q; setFound(r.results); setUnavailable(Boolean(r.unavailable)); setSearching(false) },
        () => { if (!controller.signal.aborted) { setFound([]); setUnavailable(true); setSearching(false) } },
      )
    }, SEARCH_DELAY_MS)
  }

  const options = [...towns, ...found.filter(f => !towns.some(t => t.label === f.label))]
  const typed = input.trim().length >= 2

  return (
    <Box sx={{ mb: 2.5 }}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Autocomplete<PlaceResult>
        id={id}
        options={options}
        value={value}
        onChange={(_, place) => { setUnavailable(false); onChange(place) }}
        inputValue={input}
        onInputChange={(_, text, reason) => {
          setInput(text)
          if (reason === 'input') search(text)
          if (reason === 'clear') onChange(null)
        }}
        filterOptions={x => x} // the server already matched them
        groupBy={o => (towns.includes(o) ? TOWNS : SEARCH)} // by which search found it
        getOptionLabel={o => o.label}
        isOptionEqualToValue={(o, v) => o.label === v.label && o.lat === v.lat && o.lon === v.lon}
        noOptionsText={!typed ? 'Type a city, address, port or ZIP code' : searching ? 'Searching addresses…' : unavailable ? 'No town matches, and address search isn’t answering right now.' : 'No place in the US matches that'}
        autoHighlight
        renderOption={({ key, ...props }, o) => {
          const [first, ...rest] = o.label.split(', ')
          return (
            <Box component="li" key={key} {...props} sx={{ gap: 1.25, alignItems: 'flex-start !important' }}>
              <Box sx={{ color: ink[3], mt: '3px', display: 'flex' }}>{towns.includes(o) ? <TownIcon /> : <PinIcon />}</Box>
              {towns.includes(o) ? (
                <Typography variant="body2" sx={{ fontWeight: 500, color: ink.main }}>
                  {first} <Box component="span" sx={{ color: ink[3], fontWeight: 400 }}>{rest.join(', ')}</Box>
                </Typography>
              ) : (
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: ink.main }}>{first}</Typography>
                  {rest.length > 0 && <Typography variant="caption" component="div">{rest.join(', ')}</Typography>}
                </Box>
              )}
            </Box>
          )
        }}
        renderInput={params => (
          <TextField
            {...params}
            variant="standard"
            placeholder={placeholder}
            error={Boolean(error)}
            helperText={error ?? (unavailable ? 'Address search isn’t answering right now. Towns still work.' : undefined)}
            slotProps={{
              ...params.slotProps,
              input: {
                ...params.slotProps.input,
                endAdornment: (
                  <>
                    {searching && <CircularProgress size={13} thickness={5} sx={{ color: ink[3], mr: 0.5 }} />}
                    {params.slotProps.input.endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
      />
    </Box>
  )
}
