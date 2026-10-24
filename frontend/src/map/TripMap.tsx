import { Box, Typography } from '@mui/material'
import { LngLatBounds, Map as MapLibre, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource, type PaddingOptions } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { Plan, Route } from '../api/types'
import { duration } from '../lib/format'
import { ink, RISK } from '../theme'
import { bounds, checkpointFeatures, labelMile, pointAt, routeFeatures } from './geometry'
import './map.css'
import { pin, restStop, routeLabel } from './markers'

// MapLibre finds its worker next to its own file; once bundled it can't, so it is told where Vite put it.
setWorkerUrl(workerUrl)

const STYLE = 'https://tiles.openfreemap.org/styles/positron' // free, no key
const US = { center: [-97, 39] as [number, number], zoom: 3.6 }
// Basemap layers a truck route doesn't need: minor roads, buildings, rail, airports' runways, small labels.
const HIDDEN = ['highway_path', 'highway_minor', 'building', 'aeroway-taxiway', 'aeroway-runway-casing', 'aeroway-area', 'aeroway-runway',
  'railway_transit', 'railway_transit_dashline', 'railway_service', 'railway_service_dashline', 'railway', 'railway_dashline',
  'airport', 'label_other', 'highway-name-path', 'highway-name-minor', 'label_country_1', 'label_country_2', 'label_country_3']
const EMPTY = { type: 'FeatureCollection' as const, features: [] }
const SLOW_AFTER_MS = 20_000
const byLevel = (low: string) => ['match', ['get', 'level'], 'low', low, 'moderate', RISK.moderate, 'high', RISK.high,
  'severe', RISK.severe, 'no_travel', RISK.no_travel, low] as unknown as string

interface Props {
  plan: Plan | null
  selected: Route['id'] | null
  onSelect: (id: Route['id']) => void
  padding: PaddingOptions // the part of the map the panel covers
}

function webgl(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** The map. The plan never depends on it: without WebGL the panel still shows everything. */
export default function TripMap({ plan, selected, onSelect, padding }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibre | null>(null)
  const markers = useRef<Marker[]>([])
  const [supported] = useState(webgl)
  const [ready, setReady] = useState(false) // our layers are in (the style is read)
  // The basemap's own files (tiles, fonts) can take long on a slow connection: say so, never a silent blank.
  const [basemap, setBasemap] = useState<'loading' | 'slow' | 'ready'>('loading')
  const select = useEffectEvent((id: Route['id']) => onSelect(id))

  useEffect(() => {
    if (!supported || !box.current) return
    const m = new MapLibre({ container: box.current, style: STYLE, ...US, attributionControl: { compact: true } })
    m.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    const slow = window.setTimeout(() => setBasemap(b => (b === 'loading' ? 'slow' : b)), SLOW_AFTER_MS)
    m.once('load', () => { clearTimeout(slow); setBasemap('ready') })
    // 'style.load' comes as soon as the style is read; 'load' also waits for icons and tiles,
    // and a slow basemap file must never keep the routes off the map.
    m.once('style.load', () => {
      HIDDEN.forEach(id => m.getLayer(id) && m.setLayoutProperty(id, 'visibility', 'none'))
      m.setPaintProperty('background', 'background-color', '#f4f4f2')
      m.setPaintProperty('water', 'fill-color', '#dfe6ea')
      if (m.getLayer('boundary_3')) m.setPaintProperty('boundary_3', 'line-color', '#cfcfd4')
      // Routes go under the place names, so names stay readable; checkpoints sit on top of everything.
      const labels = m.getStyle().layers.find(l => l.type === 'symbol')?.id
      const round = { 'line-join': 'round', 'line-cap': 'round' } as const
      const width = (low: number, high: number) => ['interpolate', ['linear'], ['zoom'], 4, low, 9, high] as unknown as number
      m.addSource('routes', { type: 'geojson', data: EMPTY })
      m.addSource('checkpoints', { type: 'geojson', data: EMPTY })
      m.addLayer({ id: 'route-other', type: 'line', source: 'routes', layout: round, paint: { 'line-color': '#8f949c', 'line-width': width(2.2, 4.5), 'line-opacity': 0.8 } }, labels)
      m.addLayer({ id: 'route-casing', type: 'line', source: 'routes', layout: round, paint: { 'line-color': '#fff', 'line-width': width(8, 13) } }, labels)
      m.addLayer({ id: 'route-selected', type: 'line', source: 'routes', layout: round, paint: { 'line-color': byLevel(ink.main), 'line-width': width(4, 7.5) } }, labels)
      m.addLayer({ id: 'checkpoints', type: 'circle', source: 'checkpoints', paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'],
          4, ['case', ['==', ['get', 'level'], 'low'], 1.6, 4], 9, ['case', ['==', ['get', 'level'], 'low'], 3.5, 7]] as unknown as number,
        'circle-color': byLevel('#fff'),
        'circle-stroke-color': ['case', ['==', ['get', 'level'], 'low'], ink.main, '#fff'] as unknown as string,
        'circle-stroke-width': ['case', ['==', ['get', 'level'], 'low'], 0, 2] as unknown as number,
      } })
      // A grey route is picked by clicking it; a wide invisible line makes it easy to hit.
      m.addLayer({ id: 'route-hit', type: 'line', source: 'routes', paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 16 } }, labels)
      m.on('click', 'route-hit', e => { const id = e.features?.[0]?.properties?.id; if (id) select(id) })
      m.on('mouseenter', 'route-hit', () => { m.getCanvas().style.cursor = 'pointer' })
      m.on('mouseleave', 'route-hit', () => { m.getCanvas().style.cursor = '' })
      setReady(true)
    })
    map.current = m
    return () => { clearTimeout(slow); m.remove(); map.current = null }
  }, [supported])

  // A new plan: draw its routes and frame them. No plan: back to the whole country.
  useEffect(() => {
    const m = map.current
    if (!ready || !m) return
    ;(m.getSource('routes') as GeoJSONSource).setData(plan ? routeFeatures(plan) : EMPTY)
    // The panel's part of the map is the map's own padding; fitBounds adds only a margin around the routes.
    m.setPadding(padding)
    if (plan) m.fitBounds(new LngLatBounds(...bounds(plan)), { padding: { top: 70, bottom: 70, left: 60, right: 130 }, duration: 1200 })
    else m.easeTo({ ...US, duration: 1000 })
  }, [ready, plan, padding])

  // The selected route: in colour on top, its checkpoints and rest stops shown; the others grey.
  useEffect(() => {
    const m = map.current
    if (!ready || !m) return
    const route = plan?.routes.find(r => r.id === selected)
    const id = route?.id ?? ''
    m.setFilter('route-other', ['all', ['==', ['get', 'kind'], 'whole'], ['!=', ['get', 'id'], id]])
    m.setFilter('route-casing', ['all', ['==', ['get', 'kind'], 'whole'], ['==', ['get', 'id'], id]])
    m.setFilter('route-selected', ['all', ['==', ['get', 'kind'], 'stretch'], ['==', ['get', 'id'], id]])
    m.setFilter('route-hit', ['all', ['==', ['get', 'kind'], 'whole'], ['!=', ['get', 'id'], id]])
    ;(m.getSource('checkpoints') as GeoJSONSource).setData(route ? checkpointFeatures(route) : EMPTY)

    markers.current.forEach(marker => marker.remove())
    markers.current = []
    if (!plan || !route) return
    const add = (el: HTMLElement, at: [number, number], anchor: 'center' | 'left' = 'center') =>
      markers.current.push(new Marker({ element: el, anchor }).setLngLat(at).addTo(m))
    add(pin(plan.trip.origin.label.split(',')[0]), [plan.trip.origin.lon, plan.trip.origin.lat], 'left')
    add(pin(plan.trip.destination.label.split(',')[0]), [plan.trip.destination.lon, plan.trip.destination.lat], 'left')
    route.rest_stops.forEach(s => add(restStop(s), [s.lon, s.lat]))
    plan.routes.forEach(r => add(
      routeLabel(r, duration(r.travel_seconds), r.id === route.id, () => select(r.id)),
      pointAt(r, labelMile(r, plan.routes.filter(o => o !== r))),
    ))
  }, [ready, plan, selected])

  if (!supported) {
    return (
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pl: `${padding.left}px` }}>
        <Typography variant="body2" sx={{ color: ink[3], maxWidth: 340, textAlign: 'center' }}>
          The map needs WebGL, which this browser has turned off. The plan in the panel works without it;
          turning on hardware acceleration in the browser settings brings the map back.
        </Typography>
      </Box>
    )
  }
  // MapLibre makes its container position: relative, so the container fills a box that is placed.
  return (
    <Box sx={{ position: 'absolute', inset: 0 }} data-basemap={basemap}>
      <Box ref={box} sx={{ width: 1, height: 1 }} />
      {basemap !== 'ready' && (
        <Typography role="status" variant="caption" sx={{
          position: 'absolute', top: 16, left: `calc(${padding.left}px + (100% - ${padding.left}px) / 2)`, transform: 'translateX(-50%)',
          px: 1.5, py: 0.75, borderRadius: 99, bgcolor: 'rgba(255,255,255,.9)', color: ink[2], boxShadow: '0 0 0 1px rgba(11,11,13,.07)',
        }}>
          {basemap === 'loading' ? 'Loading map…' : 'The map is slow on this connection; the plan works without it.'}
        </Typography>
      )}
    </Box>
  )
}
