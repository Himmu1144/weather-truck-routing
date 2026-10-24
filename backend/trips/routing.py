"""Routes from the routing services: Valhalla's truck router first, OSRM when it can't.

Valhalla (public server, no key) routes a truck with its weight and a 65 mph top speed,
but refuses trips over 1,500 km in a straight line. For those, or when it fails, OSRM
(car roads, no key) is used with every road segment slowed to at most 65 mph, so the two
give comparable times. Each route records which router made it.

A route is a line with, at every point, the miles and the driving time from the start,
so later steps can ask where the truck is after N hours or when it reaches mile M.
Answers are cached for a day.
"""

import hashlib
import json
import re
from collections import Counter
from dataclasses import dataclass

import requests
from django.conf import settings
from django.core.cache import cache

from .domain.geo import KM_PER_MILE, haversine_miles

VALHALLA_LIMIT_KM = 1500
LB_PER_TONNE = 2204.62
METERS_PER_MILE = 1609.344


class NoRoute(Exception):
    """No road connects the places."""


class RoutingUnavailable(Exception):
    """Every routing service failed."""


class _Refused(Exception):
    """Valhalla can't do this trip; OSRM should try."""


@dataclass(frozen=True)
class Route:
    router: str      # 'valhalla' (truck) or 'osrm' (car roads, truck speed)
    via: str         # the main roads, e.g. 'I-80 & I-76'
    line: tuple      # (lon, lat) points
    miles: tuple     # miles from the start at each point
    seconds: tuple   # driving seconds from the start at each point

    @property
    def distance_miles(self):
        return self.miles[-1]

    @property
    def drive_seconds(self):
        return self.seconds[-1]


def get_routes(points, load_lb, *, alternatives=True):
    """Routes through points [(lon, lat), ...]: origin, any via points, destination."""
    key = 'routes:' + hashlib.sha256(json.dumps(
        [[[round(x, 4) for x in p] for p in points], round(load_lb, -3), alternatives]).encode()).hexdigest()
    routes = cache.get(key)
    if routes is None:
        routes = sorted(_fetch(points, load_lb, alternatives), key=lambda route: route.drive_seconds)
        cache.set(key, routes, settings.ROUTE_CACHE_SECONDS)
    return routes


def _fetch(points, load_lb, alternatives):
    if haversine_miles(points[0], points[-1]) * KM_PER_MILE < VALHALLA_LIMIT_KM:
        try:
            return _valhalla(points, load_lb, alternatives)
        except (_Refused, requests.RequestException, ValueError, KeyError):
            pass
    return _osrm(points, alternatives)


def _session():
    session = requests.Session()
    session.headers['User-Agent'] = settings.ROUTING_USER_AGENT
    return session


# Valhalla

def _valhalla(points, load_lb, alternatives):
    body = {
        'locations': [{'lon': lon, 'lat': lat, 'type': 'break' if i in (0, len(points) - 1) else 'through'}
                      for i, (lon, lat) in enumerate(points)],
        'costing': 'truck',
        'costing_options': {'truck': {
            'weight': round((load_lb + settings.TRUCK_EMPTY_LB) / LB_PER_TONNE, 1),
            'top_speed': settings.TRUCK_TOP_SPEED_KMH,
        }},
        'units': 'miles',
        'directions_type': 'maneuvers',
    }
    if alternatives:
        body['alternates'] = 2
    response = _session().post(f'{settings.VALHALLA_URL}/route', json=body, timeout=settings.ROUTING_TIMEOUT)
    if response.status_code != 200:
        raise _Refused(response.text[:200])
    data = response.json()
    trips = [data['trip']] + [alternate['trip'] for alternate in data.get('alternates', [])]
    return [_valhalla_route(trip) for trip in trips]


def _valhalla_route(trip):
    line, miles, seconds, roads = [], [], [], Counter()
    for leg in trip['legs']:
        shape = _decode_polyline6(leg['shape'])
        start_mile, start_second = (miles[-1], seconds[-1]) if miles else (0.0, 0.0)
        leg_miles, leg_seconds = [0.0] * len(shape), [0.0] * len(shape)
        for maneuver in leg['maneuvers']:
            first, last = maneuver['begin_shape_index'], maneuver['end_shape_index']
            # spread the maneuver's length and time over its points, in proportion to distance
            steps = [haversine_miles(shape[i], shape[i + 1]) for i in range(first, last)]
            total = sum(steps) or 1.0
            for offset, step in enumerate(steps, start=first + 1):
                share = step / total
                leg_miles[offset] = leg_miles[offset - 1] + maneuver['length'] * share
                leg_seconds[offset] = leg_seconds[offset - 1] + maneuver['time'] * share
            names = maneuver.get('street_names') or []
            if names:
                roads[_road(_numbered_first(names))] += maneuver['length']
        skip = 1 if line else 0   # a later leg starts where the last one ended
        line += shape[skip:]
        miles += [start_mile + m for m in leg_miles[skip:]]
        seconds += [start_second + s for s in leg_seconds[skip:]]
    return Route('valhalla', _via(roads), tuple(line), tuple(miles), tuple(seconds))


def _decode_polyline6(encoded):
    points, index, lat, lon = [], 0, 0, 0
    while index < len(encoded):
        for axis in (0, 1):
            shift = result = 0
            while True:
                byte = ord(encoded[index]) - 63
                index += 1
                result |= (byte & 0x1F) << shift
                shift += 5
                if byte < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else result >> 1
            if axis == 0:
                lat += delta
            else:
                lon += delta
        points.append((lon / 1e6, lat / 1e6))
    return points


# OSRM

def _osrm(points, alternatives):
    coordinates = ';'.join(f'{lon},{lat}' for lon, lat in points)
    params = {'overview': 'full', 'geometries': 'geojson', 'annotations': 'distance,duration', 'steps': 'true',
              'alternatives': '3' if alternatives else 'false'}
    for server in settings.OSRM_SERVERS:
        try:
            response = _session().get(f'{server}/route/v1/driving/{coordinates}', params=params,
                                       timeout=settings.ROUTING_TIMEOUT)
            data = response.json()
        except (requests.RequestException, ValueError):
            continue
        if data.get('code') == 'Ok':
            return [_osrm_route(route) for route in data['routes']]
        if data.get('code') in ('NoRoute', 'NoSegment'):
            raise NoRoute('No road connects these places.')
    raise RoutingUnavailable('The routing services are not responding.')


def _osrm_route(route):
    cap = settings.TRUCK_TOP_SPEED_KMH * 1000 / 3600    # metres per second
    line = [tuple(point) for point in route['geometry']['coordinates']]
    miles, seconds, roads = [0.0], [0.0], Counter()
    for leg in route['legs']:
        annotation = leg['annotation']
        for metres, duration in zip(annotation['distance'], annotation['duration']):
            miles.append(miles[-1] + metres / METERS_PER_MILE)
            seconds.append(seconds[-1] + max(duration, metres / cap))
        for step in leg['steps']:
            name = step.get('ref') or step.get('name')
            if name:
                roads[_road(name.split(';')[0])] += step['distance'] / METERS_PER_MILE
    if len(miles) != len(line):
        raise RoutingUnavailable('The routing service sent an inconsistent route.')
    return Route('osrm', _via(roads), tuple(line), tuple(miles), tuple(seconds))


# Road names

def _road(name):
    """'I 30 West' -> 'I-30', 'SH 183 TEXpress' -> 'SH-183 TEXpress', other names unchanged."""
    name = re.sub(r'\s+(North|South|East|West|[NSEW]B?)$', '', name.strip())
    return re.sub(r'^([A-Z]{1,2}) (\d+[A-Z]?)\b', r'\1-\2', name)


NUMBERED = re.compile(r'^(I|[A-Z]{2})-\d')   # I-30, US-83, TX-183


def _numbered_first(names):
    """Of a road's names, the route number if it has one ('I 30 West' over 'Tom Landry Freeway')."""
    return next((name for name in names if NUMBERED.match(_road(name))), names[0])


def _via(roads):
    """The two longest roads, numbered roads first: that is how drivers name a route."""
    ranked = sorted(roads.items(), key=lambda item: (not NUMBERED.match(item[0]), -item[1]))
    return ' & '.join(name for name, _ in ranked[:2])
