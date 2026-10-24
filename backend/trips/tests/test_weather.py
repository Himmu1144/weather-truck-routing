"""Weather with Open-Meteo faked: nothing here calls the internet."""

from unittest.mock import MagicMock, patch

import requests
from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from trips import weather
from trips.weather import Reading, WeatherUnavailable, readings

T0 = 1_792_922_400       # a whole hour, 2026-10-25 10:00 UTC
H = 3600


def hourly(wind, gust, rain, showers, snow):
    return {'timezone': 'America/Chicago',
            'hourly': {'time': [T0 + k * H for k in range(len(wind))], 'wind_speed_10m': wind,
                       'wind_gusts_10m': gust, 'rain': rain, 'showers': showers, 'snowfall': snow}}


def answer(*locations, status=200):
    fake = MagicMock(status_code=status)
    fake.json.return_value = list(locations)
    return fake


class WeatherTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        patcher = patch.object(weather.requests, 'get')
        self.get = patcher.start()
        self.addCleanup(patcher.stop)

    def test_asks_for_the_units_and_days_the_rules_use(self):
        self.get.return_value = answer(hourly([10, 12], [15, 18], [0, 0], [0, 0], [0, 0]))
        reading, = readings([((-87.63, 41.88), T0 + 1800)]).readings
        params = self.get.call_args.kwargs['params']
        self.assertEqual((params['wind_speed_unit'], params['precipitation_unit']), ('mph', 'inch'))
        self.assertEqual((params['start_date'], params['end_date']), ('2026-10-24', '2026-10-26'))
        self.assertEqual(reading.time_zone, 'America/Chicago')

    def test_reading_at_a_moment(self):
        # 10:00 and 11:00; the truck is there at 10:15
        self.get.return_value = answer(hourly([20, 40], [30, 50], [0.0, 0.30], [0.0, 0.05], [0.0, 0.1]))
        reading, = readings([((-87.63, 41.88), T0 + 900)]).readings
        self.assertEqual(reading.wind_mph, 25)     # a quarter of the way from 20 to 40
        self.assertEqual(reading.gust_mph, 35)
        self.assertAlmostEqual(reading.rain_in_hr, 0.35)   # the 10:00-11:00 total, rain plus showers
        self.assertEqual(reading.snow_in_hr, 0.1)

    def test_null_readings_are_unavailable_not_calm(self):
        for field in ['wind_speed_10m', 'wind_gusts_10m', 'rain', 'showers', 'snowfall']:
            with self.subTest(field=field):
                cache.clear()
                data = hourly([10, 20], [15, 25], [0, 0], [0, 0], [0, 0])
                data['hourly'][field][1] = None
                self.get.return_value = answer(data)
                with self.assertRaisesMessage(WeatherUnavailable, 'returned incomplete data'):
                    readings([((-87.63, 41.88), T0 + 900)])

    def test_missing_fields_and_short_arrays_are_unavailable(self):
        for field in ['wind_speed_10m', 'wind_gusts_10m', 'rain', 'showers', 'snowfall']:
            for missing_field in [True, False]:
                with self.subTest(field=field, missing_field=missing_field):
                    cache.clear()
                    data = hourly([10, 20], [15, 25], [0, 0], [0, 0], [0, 0])
                    if missing_field:
                        del data['hourly'][field]
                    else:
                        data['hourly'][field] = [0]
                    self.get.return_value = answer(data)
                    with self.assertRaisesMessage(WeatherUnavailable, 'returned incomplete data'):
                        readings([((-87.63, 41.88), T0 + 900)])

    def test_both_wind_samples_are_needed_between_hours(self):
        self.get.return_value = answer(hourly([None, 20], [15, 25], [0, 0], [0, 0], [0, 0]))
        with self.assertRaisesMessage(WeatherUnavailable, 'returned incomplete data'):
            readings([((-87.63, 41.88), T0 + 900)])

    def test_an_exact_hour_does_not_need_the_previous_wind(self):
        self.get.return_value = answer(hourly([None, 20], [None, 25], [None, 0], [None, 0], [None, 0]))
        reading, = readings([((-87.63, 41.88), T0 + H)]).readings
        self.assertEqual(reading, Reading(20, 25, 0, 0, 'America/Chicago'))

    def test_missing_forecast_hour_is_unavailable(self):
        self.get.return_value = answer(hourly([10], [15], [0], [0], [0]))
        with self.assertRaisesMessage(WeatherUnavailable, 'returned incomplete data'):
            readings([((-87.63, 41.88), T0 + 900)])

    def test_nearby_points_share_one_lookup(self):
        self.get.return_value = answer(hourly([10], [10], [0], [0], [0]))
        result = readings([((-87.63, 41.88), T0), ((-87.61, 41.89), T0)])   # about a mile apart
        self.assertEqual(self.get.call_args.kwargs['params']['latitude'], '41.90')
        self.assertEqual(result.readings, [Reading(10, 10, 0, 0, 'America/Chicago')] * 2)
        self.assertEqual(result.grid_miles, 7)

    @override_settings(WEATHER_BATCH=2)
    def test_many_cells_go_in_batches(self):
        self.get.side_effect = lambda url, params, timeout: answer(
            *[hourly([5], [5], [0], [0], [0])] * len(params['latitude'].split(',')))
        readings([((-100 + k, 40), T0) for k in range(5)])
        self.assertEqual(self.get.call_count, 3)

    @override_settings(WEATHER_MAX_LOCATIONS=3)
    def test_a_trip_over_the_limit_reads_from_a_coarser_grid(self):
        self.get.side_effect = lambda url, params, timeout: answer(
            *[hourly([5], [5], [0], [0], [0])] * len(params['latitude'].split(',')))
        # three pairs of points: each pair spans two 0.1 degree cells but one 0.15 degree cell
        lons = [-99.96, -99.84, -99.66, -99.54, -99.36, -99.24]
        result = readings([((lon, 40), T0) for lon in lons])
        self.assertEqual(len(self.get.call_args.kwargs['params']['latitude'].split(',')), 3)
        self.assertEqual(result.grid_miles, 10)
        self.assertEqual(len(result.readings), 6)

    def test_repeat_lookups_come_from_the_cache(self):
        # a long trip's worth of cells, more than the cache's default 300 entries
        self.get.side_effect = lambda url, params, timeout: answer(
            *[hourly([5], [5], [0], [0], [0])] * len(params['latitude'].split(',')))
        points = [((-120 + 0.1 * k, 40), T0) for k in range(290)] + [((-120 + 0.1 * k, 41), T0) for k in range(200)]
        with self.settings(WEATHER_MAX_LOCATIONS=1000):
            readings(points)
            calls = self.get.call_count
            readings(points)
        self.assertEqual(self.get.call_count, calls)

    def test_a_busy_service_is_reported_as_busy(self):
        self.get.return_value = answer(status=429)
        with self.assertRaises(WeatherUnavailable) as raised:
            readings([((-87.63, 41.88), T0)])
        self.assertTrue(raised.exception.busy)
        self.get.return_value, self.get.side_effect = None, requests.ConnectionError()
        cache.clear()
        with self.assertRaises(WeatherUnavailable) as raised:
            readings([((-87.63, 41.88), T0)])
        self.assertFalse(raised.exception.busy)

    def test_a_used_up_daily_limit_is_not_called_busy(self):
        # Same 429 as the minute limit, but waiting 30 s won't clear it.
        refused = MagicMock(status_code=429)
        refused.json.return_value = {'error': True, 'reason': 'Daily API request limit exceeded. Please try again tomorrow.'}
        self.get.return_value = refused
        with self.assertRaises(WeatherUnavailable) as raised:
            readings([((-87.63, 41.88), T0)])
        self.assertFalse(raised.exception.busy)
        self.assertIn('daily limit', str(raised.exception))
