import { Box, Typography } from '@mui/material'
import { LngLatBounds, Map as MapLibre, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource, type PaddingOptions } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { Plan, Route } from '../api/types'
import { duration } from '../lib/format'
import { ink, RISK } from '../theme'
import { bounds, checkpointFeatures, labelMile, pointAt, routeFeatures, type CardArea } from './geometry'
import './map.css'
import { heatLayer, type HeatLayer, type HeatView } from '../heat/layer'
import type { HeatState } from '../heat/useHeatWeather'
import CheckpointCard from './CheckpointCard'
import RestStopCard from './RestStopCard'
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

export interface Focus { mile: number; seq: number } // seq: a new number for each click, so the same row can fly again

interface Props {
  plan: Plan | null
  selected: Route['id'] | null
  onSelect: (id: Route['id']) => void
  focus: Focus | null // a mile on the selected route to fly to
  heat: HeatState
  hour: number // hours after departure shown by the heatmap
  view: HeatView
  truck: { at: [number, number]; note: string | null } | null // where the truck is at that hour, and why it stands still
  padding: PaddingOptions // the part of the map the panel (and on a phone, the slider) covers
  margin: PaddingOptions // room kept around the routes when they are framed
}

// The open card: which checkpoint, whether it stays open, and where on screen (kept up to date as the map moves).
type Card = { kind: 'checkpoint' | 'rest'; route: Route['id']; index: number; pinned: boolean; lon: number; lat: number; x: number; y: number; area: CardArea }

function webgl(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** The map. The plan never depends on it: without WebGL the panel still shows everything. */
export default function TripMap({ plan, selected, onSelect, focus, heat, hour, view, truck, padding, margin }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibre | null>(null)
  const markers = useRef<Marker[]>([])
  const heatRef = useRef<HeatLayer | null>(null)
  const truckRef = useRef<Marker | null>(null)
  const [supported] = useState(webgl)
  const [ready, setReady] = useState(false) // our layers are in (the style is read)
  // The basemap's own files (tiles, fonts) can take long on a slow connection: say so, never a silent blank.
  const [basemap, setBasemap] = useState<'loading' | 'slow' | 'ready'>('loading')
  const select = useEffectEvent((id: Route['id']) => onSelect(id))
  // The checkpoint card: shown on hover, pinned by a click or tap. It follows the map as it moves.
  const [card, setCard] = useState<Card | null>(null)
  const showCard = useEffectEvent((kind: Card['kind'], index: number, pinned: boolean) => {
    const m = map.current, r = plan?.routes.find(r => r.id === selected)
    const point = kind === 'checkpoint' ? r?.checkpoints[index] : r?.rest_stops[index]
    if (!m || !point || !selected) return
    const { x, y } = m.project([point.lon, point.lat])
    const area = { width: m.getContainer().clientWidth, bottom: m.getContainer().clientHeight - (m.getPadding().bottom ?? 0) }
    setCard(open => (open?.pinned && !pinned && open.route === selected ? open : { kind, route: selected, index, pinned, lon: point.lon, lat: point.lat, x, y, area }))
  })
  const hideCard = useEffectEvent(() => setCard(c => (c?.pinned ? c : null)))

  useEffect(() => {
    if (!supported || !box.current) return
    const m = new MapLibre({ container: box.current, style: STYLE, ...US, attributionControl: { compact: true } })
    m.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    const slow = window.setTimeout(() => setBasemap(b => (b === 'loading' ? 'slow' : b)), SLOW_AFTER_MS)
    m.once('load', () => {
      clearTimeout(slow); setBasemap('ready')
      // MapLibre shows the credits open until the first drag; closed to the (i), they never cover the slider card
      m.getContainer().querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show')
    })
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
        'circle-stroke-color': ['case', ['boolean', ['feature-state', 'hover'], false], ink.main, ['==', ['get', 'level'], 'low'], ink.main, '#fff'] as unknown as string,
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hover'], false], 3, ['==', ['get', 'level'], 'low'], 0, 2] as unknown as number,
      } })
      // Dots are drawn small; this invisible wider circle is what the mouse or a finger has to hit.
      m.addLayer({ id: 'checkpoint-hit', type: 'circle', source: 'checkpoints', paint: { 'circle-radius': 11, 'circle-opacity': 0 } })
      // A grey route is picked by clicking it; a wide invisible line makes it easy to hit.
      m.addLayer({ id: 'route-hit', type: 'line', source: 'routes', paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 16 } }, labels)
      m.on('click', 'route-hit', e => { const id = e.features?.[0]?.properties?.id; if (id) select(id) })
      let hovered: number | null = null
      const hover = (index: number | null) => {
        if (hovered !== null) m.setFeatureState({ source: 'checkpoints', id: hovered }, { hover: false })
        hovered = index
        if (index !== null) m.setFeatureState({ source: 'checkpoints', id: index }, { hover: true })
      }
      m.on('mousemove', 'checkpoint-hit', e => {
        const index = e.features?.[0]?.properties?.index as number | undefined
        if (index === undefined) return
        hover(index); m.getCanvas().style.cursor = 'pointer'; showCard('checkpoint', index, false)
      })
      m.on('mouseleave', 'checkpoint-hit', () => { hover(null); m.getCanvas().style.cursor = ''; hideCard() })
      m.on('click', e => {
        // a click or tap on a checkpoint pins its card; anywhere else closes it
        const hit = m.queryRenderedFeatures(e.point, { layers: ['checkpoint-hit'] })[0]
        if (hit) showCard('checkpoint', hit.properties.index as number, true)
        else setCard(null)
      })
      m.on('move', () => setCard(c => (c ? { ...c, ...m.project([c.lon, c.lat]) } : c)))
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
    if (plan) m.fitBounds(new LngLatBounds(...bounds(plan)), { padding: margin, duration: 1200 })
    else m.easeTo({ ...US, duration: 1000 })
  }, [ready, plan, padding, margin])

  // The heatmap: a new layer for each plan's weather, under the roads and place names so they stay readable.
  const grid = heat.status === 'ready' ? heat.grid : null, weather = heat.status === 'ready' ? heat.weather : null
  const loadLb = plan?.trip.load_lb ?? 0
  useEffect(() => {
    const m = map.current
    if (!ready || !m) return
    if (m.getLayer('heat')) m.removeLayer('heat')
    heatRef.current = null
    if (!grid || !weather) return
    const layer = heatLayer(grid, weather, loadLb)
    m.addLayer(layer, m.getStyle().layers.find(l => 'source-layer' in l && l['source-layer'] === 'transportation')?.id)
    heatRef.current = layer
  }, [ready, grid, weather, loadLb])
  useEffect(() => { heatRef.current?.setHour(hour) }, [hour, grid])
  useEffect(() => { heatRef.current?.setView(view) }, [view, grid])

  // The truck dot moves with the slider, with a note while it is stopped or has arrived.
  useEffect(() => {
    const m = map.current
    if (!ready || !m) return
    if (!truck) { truckRef.current?.remove(); truckRef.current = null; return }
    if (!truckRef.current) {
      const el = document.createElement('div')
      el.className = 'tw-truck'
      el.innerHTML = '<span class="tw-truck-note"></span>'
      truckRef.current = new Marker({ element: el }).setLngLat(truck.at).addTo(m)
    } else truckRef.current.setLngLat(truck.at)
    truckRef.current.getElement().querySelector('.tw-truck-note')!.textContent = truck.note ?? ''
  }, [ready, truck])

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
    m.removeFeatureState({ source: 'checkpoints' })

    markers.current.forEach(marker => marker.remove())
    markers.current = []
    if (!plan || !route) return
    const add = (el: HTMLElement, at: [number, number], anchor: 'center' | 'left' | 'bottom' = 'center') =>
      markers.current.push(new Marker({ element: el, anchor }).setLngLat(at).addTo(m))
    add(pin(plan.trip.origin.label.split(',')[0]), [plan.trip.origin.lon, plan.trip.origin.lat], 'left')
    add(pin(plan.trip.destination.label.split(',')[0]), [plan.trip.destination.lon, plan.trip.destination.lat], 'left')
    plan.routes.forEach(r => add(
      routeLabel(r, duration(r.travel_seconds), r.id === route.id, () => select(r.id)),
      pointAt(r, labelMile(r, plan.routes.filter(o => o !== r), r === route ? route.rest_stops.map(s => s.mile) : [])), 'bottom', // above the line, pointer on it
    ))
    route.rest_stops.forEach((s, i) => add(restStop(s, { hover: inside => (inside ? showCard('rest', i, false) : hideCard()), pin: () => showCard('rest', i, true) }), [s.lon, s.lat])) // added last: on top of labels
  }, [ready, plan, selected])

  // A timeline row was clicked: fly there, and open the checkpoint's card if it is one.
  useEffect(() => {
    const m = map.current, route = plan?.routes.find(r => r.id === selected)
    if (!ready || !m || !focus || !route) return
    // On a short map (a phone, under the slider) the point goes low, so its card fits above it.
    const { top = 0, bottom = 0 } = m.getPadding(), visible = m.getContainer().clientHeight - top - bottom
    m.flyTo({ center: pointAt(route, focus.mile), zoom: Math.max(m.getZoom(), 7), offset: [0, visible < 500 ? visible * 0.25 : 0], duration: 1200 })
    const index = route.checkpoints.findIndex(c => Math.abs(c.mile - focus.mile) < 0.01)
    const rest = route.rest_stops.findIndex(s => Math.abs(s.mile - focus.mile) < 0.01)
    if (index >= 0) m.once('moveend', () => showCard('checkpoint', index, true))
    else if (rest >= 0) m.once('moveend', () => showCard('rest', rest, true))
  }, [ready, focus, plan, selected])

  const route = plan?.routes.find(r => r.id === selected)
  const open = card && route && card.route === route.id ? card : null
  const checkpoint = open?.kind === 'checkpoint' ? route!.checkpoints[open.index] : undefined
  const stop = open?.kind === 'rest' ? route!.rest_stops[open.index] : undefined

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
      {open && checkpoint && <CheckpointCard checkpoint={checkpoint} x={open.x} y={open.y} area={open.area} onClose={open.pinned ? () => setCard(null) : undefined} />}
      {open && stop && <RestStopCard stop={stop} x={open.x} y={open.y} area={open.area} onClose={open.pinned ? () => setCard(null) : undefined} />}
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
