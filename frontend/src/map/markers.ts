// Small DOM elements for MapLibre markers: start and end pins, rest stops, route labels.
import type { RestStop, Route } from '../api/types'

const CUP = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 6h9v3.5a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4V6zm9 1h1a2 2 0 0 1 0 4h-1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
const BED = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1.5 4v9m0-3h13m0 3V8.5A1.5 1.5 0 0 0 13 7H7v3M4.2 8.6a1.3 1.3 0 1 0 0-.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

function element(className: string, html: string, title?: string): HTMLElement {
  const el = document.createElement('div')
  el.className = className
  el.innerHTML = html
  if (title) el.title = title
  return el
}

export const pin = (label: string) => element('tw-pin', `<i></i><span>${escape(label)}</span>`)

export const restStop = (stop: RestStop) => stop.kind === 'rest'
  ? element('tw-rest', `${BED}10 h`, `10-hour rest, required after 11 h of driving · mile ${Math.round(stop.mile)}`)
  : element('tw-rest', `${CUP}30 min`, `30-minute break, required after 8 h of driving · mile ${Math.round(stop.mile)}`)

export function routeLabel(route: Route, duration: string, selected: boolean, onClick: () => void): HTMLElement {
  const el = element(`tw-label${selected ? ' on' : ''}`,
    `<b>${route.id}</b>${duration}<span class="tw-miles"> · ${Math.round(route.distance_mi).toLocaleString('en-US')} mi</span>`)
  el.setAttribute('role', 'button')
  el.setAttribute('aria-label', `Show route ${route.id}`)
  el.addEventListener('click', onClick)
  return el
}

const escape = (text: string) => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
