from unittest import TestCase

from trips.domain.hours import HOUR, elapsed, stops_for


def plan(hours):
    return [(stop.drive_seconds / HOUR, stop.kind) for stop in stops_for(hours * HOUR)]


class StopTests(TestCase):
    def test_under_8_hours_needs_no_stop(self):
        self.assertEqual(plan(7.9), [])

    def test_break_after_8_hours_of_driving(self):
        self.assertEqual(plan(10), [(8, 'break')])

    def test_no_stop_when_the_trip_ends_at_the_limit(self):
        self.assertEqual(plan(8), [])
        self.assertEqual(plan(11), [(8, 'break')])

    def test_rest_after_11_hours_then_the_cycle_starts_again(self):
        self.assertEqual(plan(20), [(8, 'break'), (11, 'rest'), (19, 'break')])

    def test_seattle_to_miami(self):
        # 58.8 h of driving (OSRM, Phase 1 test): 5 rests and 5 breaks, arriving after 111.3 h
        stops = stops_for(58.8 * HOUR)
        self.assertEqual([s.kind for s in stops].count('rest'), 5)
        self.assertEqual([s.kind for s in stops].count('break'), 5)
        self.assertAlmostEqual(elapsed(58.8 * HOUR, stops) / HOUR, 111.3)


class ElapsedTests(TestCase):
    def test_time_since_departure_includes_the_stops_already_taken(self):
        stops = stops_for(20 * HOUR)
        for driven, expected in [(5, 5), (8, 8), (9, 9.5), (11, 11.5), (12, 22.5), (20, 31)]:
            with self.subTest(driven=driven):
                self.assertEqual(elapsed(driven * HOUR, stops) / HOUR, expected)

    def test_no_stops_means_nonstop(self):
        self.assertEqual(elapsed(30 * HOUR, ()), 30 * HOUR)

