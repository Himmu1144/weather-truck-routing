from unittest import TestCase
from unittest.mock import patch

from trips import options
from trips.domain.geo import doubled_back_miles, haversine_miles, shared_share
from trips.routing import NoRoute, Route

WEST, EAST = (-100.0, 35.0), (-90.0, 35.0)    # about 565 miles apart


def route(points, hours, via=''):
    miles = [0.0]
    for a, b in zip(points, points[1:]):
        miles.append(miles[-1] + haversine_miles(a, b))
    seconds = [m / miles[-1] * hours * 3600 for m in miles]
    return Route('osrm', via, tuple(points), tuple(miles), tuple(seconds))


FASTEST = route([WEST, EAST], 10, 'A')
NORTH = route([WEST, (-95, 36.2), EAST], 11, 'north')
SOUTH = route([WEST, (-95, 33.8), EAST], 11.5, 'south')
NEAR_COPY = route([WEST, (-95, 35.002), EAST], 10.1, 'copy')
TOO_SLOW = route([WEST, (-95, 37.5), EAST], 13, 'slow')                     # 1.3x the fastest
SPUR = route([WEST, (-95, 33.8), (-95, 33.5), (-95, 33.8), EAST], 11.6, 'spur')  # the south road, plus a spur out and back


class OptionTests(TestCase):
    def run_options(self, router_routes, detours=()):
        with patch.object(options, 'get_routes', return_value=router_routes), \
             patch.object(options, '_detours', return_value=list(detours)) as detour:
            result = options.route_options(WEST, EAST, 40_000)
        return result, detour

    def test_three_good_router_routes_need_no_detours(self):
        result, detour = self.run_options([FASTEST, NORTH, SOUTH])
        self.assertEqual([r.via for r in result.routes], ['A', 'north', 'south'])
        self.assertIsNone(result.note)
        detour.assert_not_called()

    def test_the_routers_own_routes_are_not_checked_for_spurs(self):
        result, _ = self.run_options([FASTEST, NORTH, SPUR])
        self.assertEqual([r.via for r in result.routes], ['A', 'north', 'spur'])

    def test_a_near_copy_from_the_router_is_replaced_by_a_detour(self):
        result, _ = self.run_options([FASTEST, NEAR_COPY, NORTH], detours=[SOUTH])
        self.assertEqual([r.via for r in result.routes], ['A', 'north', 'south'])

    def test_detours_a_driver_would_not_take_are_refused(self):
        result, _ = self.run_options([FASTEST, NORTH], detours=[TOO_SLOW, SPUR, NORTH])
        self.assertEqual([r.via for r in result.routes], ['A', 'north'])
        self.assertEqual(result.note, 'Only 2 practical routes found: other ways round were over 25% slower '
                                      'or used the same roads.')


class DetourPointTests(TestCase):
    def test_via_points_sit_to_both_sides_of_the_middle(self):
        calls = []

        def fake(points, load_lb, alternatives=True):
            calls.append(points[1])
            if points[1][1] < 34:
                raise NoRoute('in the sea')
            return [NORTH]

        with patch.object(options, 'get_routes', side_effect=fake):
            found = options._detours(WEST, EAST, FASTEST, 40_000)

        offsets = sorted(haversine_miles((-95, 35), via) for via in calls)
        for got, expected in zip(offsets, [85, 85, 141, 141]):   # 15% and 25% of 565 mi
            self.assertAlmostEqual(got, expected, delta=2)
        self.assertEqual(sorted(via[1] > 35 for via in calls), [False, False, True, True])
        self.assertEqual(len(found), 2)                          # the failed side is skipped


class ShapeTests(TestCase):
    def test_shared_share(self):
        self.assertEqual(shared_share(FASTEST.line, FASTEST.miles, FASTEST.line, FASTEST.miles), 1)
        self.assertLess(shared_share(NORTH.line, NORTH.miles, FASTEST.line, FASTEST.miles), 0.1)

    def test_doubling_back(self):
        self.assertEqual(doubled_back_miles(FASTEST.line, FASTEST.miles), 0)
        self.assertGreater(doubled_back_miles(SPUR.line, SPUR.miles), 10)   # 20.7 mi out and back
