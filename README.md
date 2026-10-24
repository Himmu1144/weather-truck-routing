# Weather-Aware Truck Routing

A React + Django app that recommends the safest truck route, using the weather at the hour the truck reaches each point on the road and the load it carries.

**Live:** https://weather-truck-routing-ashy.vercel.app

## What it does
- Enter origin, destination, departure time (in your own time zone) and load weight; pick weather checkpoints every 10, 25 or 50 miles.
- Up to three routes. Each checkpoint gets the forecast for the hour the truck arrives there, classified with the brief's risk table and load rules.
- A recommendation with the reason in plain words, every route on the map coloured by risk, checkpoint and rest-stop cards, and a timeline.
- A weather heatmap along the corridor with a 0 to 48 h slider (hour 0 = departure). All hours are fetched once, so sliding never refetches; it is drawn on the GPU.
- Works on phones (bottom sheet + compact slider).

## Run it locally
No API keys needed.

```bash
# backend (Python 3.12+)
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py runserver 8000

# frontend (Node 20+), in another terminal
cd frontend
npm install && npm run dev        # http://localhost:5173, /api is proxied to :8000
```

Tests: `cd backend && .venv/bin/python manage.py test` (94) · `cd frontend && npm test` (79). No test calls a real API.

## How the rules are read
- **Risk:** the actual reading is compared with the brief's table. Where two bands share an edge (25 mph, 0.25 in/hr…) the higher, safer band applies, except where the table says ">" for No Travel (rain > 1.00, snow > 3.0). Rain and snow are scored separately; steady wind is scored, gusts are shown. The worst condition sets the level, and the app names it.
- **Load rules:** strict ">": exactly 30,000 or 40,000 lb does not escalate. Load is cargo weight.
- **Recommendation:** the brief's order (fewest Severe miles, fewest High miles, lowest average risk, shortest travel time), with one rule added first: fewest No Travel miles, so a route the rules say not to drive never wins. Miles are counted halfway to each neighbouring checkpoint.
- **ETAs include rest breaks** (switchable): a 30-min break after 8 h of driving and 10 h off duty when the 11-h driving limit is reached. This is a simple model of the US hours-of-service rules, not full compliance (it doesn't know the driver's remaining hours; the 14-h and 70-h rules don't bind on a single trip).
- **Departure:** up to 7 days ahead; checkpoints more than 72 h out are labelled long-range.

## Architecture
- `backend/trips/domain/`: the rules in plain Python (risk, exposure, ranking, hours), no Django, unit-tested.
- `backend/trips/`: routing, weather and place search clients, the planner, and a thin DRF view (`POST /api/plans/`, `GET /api/places/`).
- `frontend/src/`: React 19 + TypeScript + MUI; MapLibre for the map; the heatmap is a small WebGL2 layer.
- Hosting: React on Vercel; Django on Cloud Run (kept warm by a 5-minute Cloud Scheduler ping). Vercel forwards `/api/*` to Cloud Run, so there is one origin and no CORS.

## Services and limits
| Need | Service (free, no key) | Limit / note |
|---|---|---|
| Truck routes | Valhalla (OSM public server), truck profile | Refuses very long trips; then OSRM (car roads) is used, and each route says which router made it |
| Alternatives | Router alternatives + one side detour if at most ~25% slower and clearly different | Some trips only have two sensible roads; the app shows two and says why |
| Weather | Open-Meteo | Free tier is rate-limited per IP; the app counts down and retries when busy, and says so plainly when the daily limit is reached |
| Places | Photon + a bundled US town list | Finds cities, ports, ZIPs; not every house-number address |

Contiguous US only. The map needs WebGL2.

## In production I would
Use a commercial truck router (bridge heights, hazmat), a paid or self-hosted Open-Meteo and Photon, a shared cache (Redis) instead of per-instance memory, and start rest breaks from the driver's actual logbook hours.
