// Small DOM elements for MapLibre markers: start and end pins, rest stops, route labels.
import type { RestStop, Route } from '../api/types'

const CUP = '<svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 6h9v3.5a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4V6zm9 1h1a2 2 0 0 1 0 4h-1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
const BED = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1.5 4v9m0-3h13m0 3V8.5A1.5 1.5 0 0 0 13 7H7v3M4.2 8.6a1.3 1.3 0 1 0 0-.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

function element(className: string, html: string, title?: string): HTMLElement {
  const el = document.createElement('div')
  el.className = className
  el.innerHTML = html
  if (title) el.title = title
  return el
}

export const pin = (label: string) => element('tw-pin', `<i></i><span>${escape(label)}</span>`)

// A small round icon on the line: it covers no more of the route than the line's own width.
// Hover or tap opens its card (handled by the map).
export function restStop(stop: RestStop, on: { hover: (inside: boolean) => void; pin: () => void }): HTMLElement {
  const el = element('tw-rest', stop.kind === 'rest' ? BED : CUP)
  el.setAttribute('role', 'button')
  el.setAttribute('aria-label', `${stop.kind === 'rest' ? '10 hours off duty' : '30-minute break'} at mile ${Math.round(stop.mile)}`)
  el.addEventListener('mouseenter', () => on.hover(true))
  el.addEventListener('mouseleave', () => on.hover(false))
  el.addEventListener('click', e => { e.stopPropagation(); on.pin() })
  // keep the pointer to itself, so the map doesn't open the checkpoint underneath instead
  el.addEventListener('mousemove', e => e.stopPropagation())
  return el
}

/** A callout that floats above its route, its pointer touching the line, so the line stays visible. */
export function routeLabel(route: Route, duration: string, selected: boolean, onClick: () => void): HTMLElement {
  const el = element(`tw-label${selected ? ' on' : ''}`,
    `<span class="tw-pill"><b>${route.id}</b>${duration}<span class="tw-miles"> · ${Math.round(route.distance_mi).toLocaleString('en-US')} mi</span></span><i></i>`)
  el.setAttribute('role', 'button')
  el.setAttribute('aria-label', `Show route ${route.id}`)
  el.addEventListener('click', onClick)
  return el
}

const escape = (text: string) => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
