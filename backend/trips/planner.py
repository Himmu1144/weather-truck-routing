"""One trip end to end: routes, checkpoints, weather, risk, ranking, and the response."""

from datetime import UTC, datetime
from time import perf_counter, time

from . import weather
from .domain.checkpoints import plan_checkpoints
from .domain.exposure import exposure
from .domain.geo import simplify
from .domain.ranking import RouteSummary, rank
from .domain.risk import assess
from .options import route_options

LONG_RANGE_HOURS = 72          # forecasts further ahead are labelled less certain
LINE_TOLERANCE_DEGREES = 0.0005   # about 50 m: the drawn line stays that close to the road
NAMES = 'ABC'


def _iso(seconds):
    return datetime.fromtimestamp(round(seconds), UTC).isoformat().replace('+00:00', 'Z')


def _level(level):
    return level.name.lower()   # 'low', 'moderate', 'high', 'severe', 'no_travel'


def plan_trip(origin, destination, departure, load_lb, interval_mi, rest_breaks=True):
    started = perf_counter()
    options = route_options((origin['lon'], origin['lat']), (destination['lon'], destination['lat']), load_lb)
    routed = perf_counter()

    planned = [plan_checkpoints(route, interval_mi, rest_breaks=rest_breaks) for route in options.routes]
    leaves = departure.timestamp()
    lookup = weather.readings([(c.point, leaves + c.elapsed_seconds) for checkpoints, _ in planned for c in checkpoints])
    forecasted = perf_counter()

    readings = iter(lookup.readings)
    long_range_after = time() + LONG_RANGE_HOURS * 3600
    routes, summaries = [], []
    for name, route, (checkpoints, rest_stops) in zip(NAMES, options.routes, planned):
        points, levels = [], []
        for checkpoint in checkpoints:
            reading = next(readings)
            risk = assess(reading.wind_mph, reading.rain_in_hr, reading.snow_in_hr, load_lb)
            at = leaves + checkpoint.elapsed_seconds
            points.append({
                'mile': round(checkpoint.mile, 1),
                'lon': round(checkpoint.point[0], 5), 'lat': round(checkpoint.point[1], 5),
                'eta': _iso(at), 'time_zone': reading.time_zone,
                'hours_after_departure': round(checkpoint.elapsed_seconds / 3600, 2),
                'long_range': at > long_range_after,
                'wind_mph': round(reading.wind_mph, 1), 'gust_mph': round(reading.gust_mph, 1),
                'rain_in_hr': round(reading.rain_in_hr, 2), 'snow_in_hr': round(reading.snow_in_hr, 2),
                'level': _level(risk.level), 'causes': list(risk.causes),
                'load_raised_wind': risk.load_raised_wind, 'reason': risk.reason,
            })
            levels.append((checkpoint.mile, risk.level))

        route_exposure = exposure(levels, route.distance_miles)
        travel_seconds = checkpoints[-1].elapsed_seconds
        summaries.append(RouteSummary(name, route_exposure, travel_seconds))

        def zone_at(mile):
            return min(points, key=lambda p: abs(p['mile'] - mile))['time_zone']

        keep = simplify(route.line, LINE_TOLERANCE_DEGREES)
        routes.append({
            'id': name, 'via': route.via, 'router': route.router,
            'distance_mi': round(route.distance_miles, 1),
            'drive_seconds': round(route.drive_seconds),
            'travel_seconds': round(travel_seconds),
            'arrival': _iso(leaves + travel_seconds), 'arrival_time_zone': points[-1]['time_zone'],
            'exposure': {
                'miles': {_level(level): round(miles, 1) for level, miles in route_exposure.miles.items()},
                'average_risk': round(route_exposure.average_risk, 2),
            },
            'stretches': [{'start_mi': round(s.start_mile, 1), 'end_mi': round(s.end_mile, 1), 'level': _level(s.level)}
                          for s in route_exposure.stretches],
            'checkpoints': points,
            'rest_stops': [{
                'mile': round(stop.mile, 1), 'lon': round(stop.point[0], 5), 'lat': round(stop.point[1], 5),
                'starts': _iso(leaves + stop.elapsed_seconds), 'time_zone': zone_at(stop.mile),
                'minutes': round(stop.duration_seconds / 60), 'kind': stop.kind,
            } for stop in rest_stops],
            # [lon, lat, mile] so the browser can colour each stretch along the line
            'line': [[round(route.line[i][0], 5), round(route.line[i][1], 5), round(route.miles[i], 2)] for i in keep],
        })

    ranking = rank(summaries)
    for route in routes:
        route['rank'] = ranking.order.index(route['id']) + 1
        route['recommended'] = route['id'] == ranking.recommended
        route['not_chosen'] = ranking.not_chosen.get(route['id'])

    notes = [options.note] if options.note else []
    if lookup.grid_miles > 7:
        notes.append(f'Long trip: checkpoints share forecasts on a {lookup.grid_miles}-mile grid '
                     'to stay within the free weather service\'s limits.')
    if any(route['router'] == 'osrm' for route in routes):
        notes.append('Routes over 1,500 km use OSRM (car road network, truck speed limit): '
                     'the free truck router doesn\'t plan trips that long.')

    return {
        'trip': {
            'origin': origin, 'destination': destination, 'departure': _iso(leaves),
            'load_lb': load_lb, 'interval_mi': interval_mi, 'rest_breaks': rest_breaks,
        },
        'routes': sorted(routes, key=lambda route: route['id']),
        'recommendation': {'route_id': ranking.recommended, 'reason': ranking.reason, 'warning': ranking.warning},
        'notes': notes,
        'meta': {
            'weather_grid_miles': lookup.grid_miles,
            'timings_ms': {'routing': round((routed - started) * 1000), 'weather': round((forecasted - routed) * 1000),
                           'total': round((perf_counter() - started) * 1000)},
        },
    }
