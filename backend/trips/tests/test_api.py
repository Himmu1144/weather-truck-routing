"""The plans endpoint with routing and weather faked: nothing here calls the internet."""

from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase
from django.utils import timezone

from trips import planner
from trips.options import Options
from trips.routing import NoRoute, RoutingUnavailable
from trips.tests.test_options import FASTEST, NORTH, SOUTH
from trips.tests.test_weather import answer, hourly
from trips.weather import Lookup, Reading, WeatherUnavailable

WEST = {'label': 'West, OK', 'lat': 35.0, 'lon': -100.0}
EAST = {'label': 'East, TN', 'lat': 35.0, 'lon': -90.0}


def windy_north(asks):
    """40 mph wind north of 35.5 degrees (only on Route B's arc), calm elsewhere."""
    return Lookup([Reading(40 if lat > 35.5 else 10, 50, 0, 0, 'America/Chicago') for (lon, lat), _ in asks], 7)


class PlanTests(SimpleTestCase):
    def request(self, **changes):
        body = {'origin': WEST, 'destination': EAST, 'load_lb': 45_000, 'interval_mi': 25,
                'departure': (timezone.now() + timedelta(hours=1)).isoformat(), **changes}
        return self.client.post('/api/plans/', body, content_type='application/json')

    def plan(self, weather=windy_north, routes=(FASTEST, NORTH, SOUTH), note=None, **changes):
        with patch.object(planner, 'route_options', return_value=Options(list(routes), note)), \
             patch.object(planner.weather, 'readings', side_effect=weather):
            return self.request(**changes)

    def test_a_planned_trip(self):
        response = self.plan()
        self.assertEqual(response.status_code, 200)
        data = response.json()
        a, b, c = data['routes']
        self.assertEqual([a['id'], b['id'], c['id']], ['A', 'B', 'C'])
        # 40 mph with 45,000 lb is Severe: only Route B goes north into it
        self.assertGreater(b['exposure']['miles']['severe'], 0)
        self.assertEqual(a['exposure']['miles']['severe'], 0)
        self.assertEqual(data['recommendation']['route_id'], 'A')
        self.assertTrue(a['recommended'])
        self.assertEqual(b['rank'], 3)
        windy = next(p for p in b['checkpoints'] if p['level'] == 'severe')
        self.assertEqual(windy['reason'], 'Severe: wind 40.0 mph with a 45,000 lb load (High at 40,000 lb or less)')
        self.assertEqual(windy['time_zone'], 'America/Chicago')
        # 10 h of driving: one 30-minute break, and the arrival includes it
        self.assertEqual([(s['kind'], s['minutes']) for s in a['rest_stops']], [('break', 30)])
        self.assertEqual(a['travel_seconds'], 10.5 * 3600)
        self.assertAlmostEqual(a['line'][-1][2], a['distance_mi'], delta=0.05)
        self.assertRegex(a['arrival'], r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$')

    def test_answers_are_compressed_when_the_browser_accepts_it(self):
        with patch.object(planner, 'route_options', return_value=Options([FASTEST, NORTH, SOUTH], None)), \
             patch.object(planner.weather, 'readings', side_effect=windy_north):
            body = {'origin': WEST, 'destination': EAST, 'load_lb': 45_000, 'interval_mi': 10,
                    'departure': (timezone.now() + timedelta(hours=1)).isoformat()}
            response = self.client.post('/api/plans/', body, content_type='application/json',
                                        headers={'Accept-Encoding': 'gzip'})
        self.assertEqual(response['Content-Encoding'], 'gzip')

    def test_without_rest_breaks(self):
        a = self.plan(rest_breaks=False).json()['routes'][0]
        self.assertEqual((a['rest_stops'], a['travel_seconds']), ([], 10 * 3600))

    def test_forecasts_beyond_three_days_are_labelled(self):
        checkpoints = self.plan(departure=(timezone.now() + timedelta(days=4)).isoformat()).json()['routes'][0]['checkpoints']
        self.assertTrue(all(p['long_range'] for p in checkpoints))

    def test_notes_explain_fewer_routes_and_a_coarse_weather_grid(self):
        data = self.plan(routes=(FASTEST, NORTH), note='Only 2 practical routes found.',
                         weather=lambda asks: Lookup(windy_north(asks).readings, 34)).json()
        self.assertEqual(len(data['routes']), 2)
        self.assertEqual(data['notes'][0], 'Only 2 practical routes found.')
        self.assertIn('34-mile grid', data['notes'][1])


class BadRequestTests(SimpleTestCase):
    def test_each_bad_field_is_named(self):
        now = timezone.now()
        cases = [
            ({'interval_mi': 15}, 'interval_mi'),
            ({'load_lb': 90_000}, 'load_lb'),
            ({'load_lb': -1}, 'load_lb'),
            ({'departure': (now - timedelta(hours=3)).isoformat()}, 'departure'),
            ({'departure': (now + timedelta(days=8)).isoformat()}, 'departure'),
            ({'origin': {'label': 'Toronto', 'lat': 43.65, 'lon': -79.38 - 50}}, 'origin'),
            ({'destination': WEST}, 'destination'),
        ]
        for change, field in cases:
            with self.subTest(change=change):
                response = PlanTests.request(self, **change)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()['error']['code'], 'invalid_request')
                self.assertIn(field, response.json()['error']['fields'])

    def test_broken_json_has_the_same_error_shape(self):
        response = self.client.post('/api/plans/', '{oops', content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'parse_error')


class ServiceErrorTests(SimpleTestCase):
    def failing(self, error, weather_error=None):
        with patch.object(planner, 'route_options', side_effect=error), \
             patch.object(planner.weather, 'readings', side_effect=weather_error):
            return PlanTests.request(self)

    def test_each_failure_has_its_status(self):
        self.assertEqual(self.failing(NoRoute()).status_code, 422)
        self.assertEqual(self.failing(RoutingUnavailable()).status_code, 502)

    def test_a_busy_weather_service_says_when_to_retry(self):
        with patch.object(planner, 'route_options', return_value=Options([FASTEST], None)), \
             patch.object(planner.weather, 'readings', side_effect=WeatherUnavailable('busy', busy=True)):
            response = PlanTests.request(self)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response['Retry-After'], '30')
        self.assertEqual(response.json()['error']['code'], 'weather_busy')

    def test_null_upstream_weather_returns_502(self):
        cache.clear()
        data = hourly([None] * 24, [15] * 24, [0] * 24, [0] * 24, [0] * 24)
        start = int(timezone.now().timestamp() // 3600) * 3600
        data['hourly']['time'] = [start + k * 3600 for k in range(24)]
        with patch.object(planner, 'route_options', return_value=Options([FASTEST], None)), \
             patch.object(planner.weather.requests, 'get', return_value=answer(data)):
            response = PlanTests.request(self)
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()['error']['code'], 'weather_unavailable')
        self.assertEqual(response.json()['error']['message'],
                         'The weather service returned incomplete data. Try again in a moment.')
