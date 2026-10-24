"""Routing with the services faked: nothing here calls the internet."""

from unittest.mock import MagicMock, patch

import requests
from django.core.cache import cache
from django.test import SimpleTestCase

from trips import routing
from trips.routing import NoRoute, RoutingUnavailable, get_routes

DALLAS, FORT_WORTH, SEATTLE, MIAMI = (-96.797, 32.777), (-97.331, 32.755), (-122.332, 47.606), (-80.192, 25.762)


def encode_polyline6(points):
    out, last = [], (0, 0)
    for lon, lat in points:
        current = (round(lat * 1e6), round(lon * 1e6))
        for value, previous in zip(current, last):
            delta = value - previous
            delta = ~(delta << 1) if delta < 0 else delta << 1
            while delta >= 0x20:
                out.append(chr((0x20 | (delta & 0x1F)) + 63))
                delta >>= 5
            out.append(chr(delta + 63))
        last = current
    return ''.join(out)


def valhalla_trip(points, length, time, names=('I 30 West',)):
    return {'legs': [{'shape': encode_polyline6(points), 'maneuvers': [
        {'street_names': list(names), 'length': length, 'time': time,
         'begin_shape_index': 0, 'end_shape_index': len(points) - 1},
        {'street_names': None, 'length': 0, 'time': 0,
         'begin_shape_index': len(points) - 1, 'end_shape_index': len(points) - 1},
    ]}], 'summary': {'length': length, 'time': time}}


def response(status=200, body=None):
    fake = MagicMock(status_code=status)
    fake.json.return_value = body
    fake.text = str(body)
    return fake


def osrm_body(seconds_per_segment=60):
    # three points about 6.7 and 6.7 km apart (~4.2 mi each)
    return {'code': 'Ok', 'routes': [{
        'geometry': encode_polyline6([(-96.8, 32.78), (-96.87, 32.78), (-96.94, 32.78)]),
        'legs': [{'annotation': {'distance': [6700, 6700], 'duration': [seconds_per_segment] * 2},
                  'steps': [{'ref': 'I 30', 'name': 'Tom Landry Freeway', 'distance': 13400}]}],
    }]}


class RoutingTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        patcher = patch.object(routing.requests, 'Session')
        self.session = patcher.start().return_value
        self.addCleanup(patcher.stop)

    def test_valhalla_truck_routes_fastest_first_named_by_route_number(self):
        # Valhalla doesn't always put the fastest first; road names may come before the number
        slower = valhalla_trip([DALLAS, (-97.0, 32.84), FORT_WORTH], 36.8, 2320, names=['Airport Freeway', 'TX 183'])
        faster = valhalla_trip([DALLAS, (-97.0, 32.77), FORT_WORTH], 32.1, 2010, names=['Tom Landry Freeway', 'I 30 West'])
        self.session.post.return_value = response(body={'trip': slower, 'alternates': [{'trip': faster}]})

        routes = get_routes([DALLAS, FORT_WORTH], 40_000)

        self.assertEqual([r.router for r in routes], ['valhalla', 'valhalla'])
        self.assertEqual([r.via for r in routes], ['I-30', 'TX-183'])
        self.assertAlmostEqual(routes[0].distance_miles, 32.1)
        self.assertAlmostEqual(routes[0].drive_seconds, 2010)
        self.assertEqual(len(routes[0].line), len(routes[0].miles))
        self.assertEqual(list(routes[0].miles), sorted(routes[0].miles))

    def test_valhalla_gets_the_whole_truck_and_a_65_mph_limit(self):
        self.session.post.return_value = response(body={'trip': valhalla_trip([DALLAS, FORT_WORTH], 32, 2000)})
        get_routes([DALLAS, FORT_WORTH], 40_000)
        truck = self.session.post.call_args.kwargs['json']['costing_options']['truck']
        self.assertEqual(truck, {'weight': 34.0, 'top_speed': 105})    # (40,000 + 35,000) lb in tonnes

    def test_valhalla_refusal_falls_back_to_osrm_at_truck_speed(self):
        self.session.post.return_value = response(400, {'error_code': 154})
        self.session.get.return_value = response(body=osrm_body(seconds_per_segment=60))

        route, = get_routes([DALLAS, FORT_WORTH], 40_000)

        self.assertEqual(route.router, 'osrm')
        self.assertEqual(route.via, 'I-30')
        # 6.7 km in 60 s is 250 mph; at most 65 mph that is 6.7 km / 29.17 m/s = 229.7 s per segment
        self.assertAlmostEqual(route.drive_seconds, 2 * 6700 / (105 / 3.6), places=1)

    def test_valhalla_down_falls_back_to_osrm(self):
        self.session.post.side_effect = requests.Timeout()
        self.session.get.return_value = response(body=osrm_body())
        self.assertEqual(get_routes([DALLAS, FORT_WORTH], 0)[0].router, 'osrm')

    def test_long_trips_skip_valhalla(self):
        self.session.get.return_value = response(body=osrm_body())
        get_routes([SEATTLE, MIAMI], 0)
        self.session.post.assert_not_called()

    def test_second_osrm_server_is_tried(self):
        self.session.get.side_effect = [requests.ConnectionError(), response(body=osrm_body())]
        self.assertEqual(len(get_routes([SEATTLE, MIAMI], 0)), 1)

    def test_no_road_and_no_service_are_different_errors(self):
        self.session.get.return_value = response(body={'code': 'NoRoute'})
        with self.assertRaises(NoRoute):
            get_routes([SEATTLE, MIAMI], 0)
        cache.clear()
        self.session.get.side_effect = requests.ConnectionError()
        with self.assertRaises(RoutingUnavailable):
            get_routes([SEATTLE, MIAMI], 0)

    def test_repeat_trips_come_from_the_cache(self):
        self.session.get.return_value = response(body=osrm_body())
        get_routes([SEATTLE, MIAMI], 20_000)
        get_routes([SEATTLE, MIAMI], 20_000)
        self.assertEqual(self.session.get.call_count, 1)
