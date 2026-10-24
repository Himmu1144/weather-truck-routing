from types import SimpleNamespace
from unittest import TestCase

from trips.domain.checkpoints import plan_checkpoints
from trips.domain.hours import HOUR


def straight_route(miles, mph=60):
    """A route due east along the equator at a steady speed, one point per mile."""
    marks = list(range(int(miles) + 1)) + ([miles] if miles != int(miles) else [])
    return SimpleNamespace(line=tuple((m / 69.17, 0.0) for m in marks), miles=tuple(map(float, marks)),
                           seconds=tuple(m / mph * HOUR for m in marks))


class CheckpointTests(TestCase):
    def test_every_interval_plus_the_destination(self):
        checkpoints, _ = plan_checkpoints(straight_route(60), 25)
        self.assertEqual([c.mile for c in checkpoints], [0, 25, 50, 60])

    def test_no_duplicate_when_the_destination_falls_on_the_interval(self):
        checkpoints, _ = plan_checkpoints(straight_route(50), 25)
        self.assertEqual([c.mile for c in checkpoints], [0, 25, 50])

    def test_times_include_the_breaks_already_taken(self):
        # 600 mi at 60 mph: 10 h of driving, a 30-minute break after 8 h at mile 480
        checkpoints, stops = plan_checkpoints(straight_route(600), 10)
        hours = {c.mile: c.elapsed_seconds / HOUR for c in checkpoints}
        self.assertEqual(hours[470], 470 / 60)
        self.assertEqual(hours[480], 8)          # arrives, then takes the break
        self.assertEqual(hours[490], 490 / 60 + 0.5)
        self.assertEqual(hours[600], 10.5)
        self.assertEqual([(s.mile, s.kind, s.elapsed_seconds / HOUR) for s in stops], [(480, 'break', 8)])

    def test_without_rest_breaks_times_are_nonstop(self):
        checkpoints, stops = plan_checkpoints(straight_route(600), 50, rest_breaks=False)
        self.assertEqual(checkpoints[-1].elapsed_seconds, 10 * HOUR)
        self.assertEqual(stops, [])

    def test_checkpoints_sit_on_the_route(self):
        checkpoints, _ = plan_checkpoints(straight_route(60.5), 25)
        self.assertAlmostEqual(checkpoints[1].point[0], 25 / 69.17)
        self.assertEqual(checkpoints[-1].point, (60.5 / 69.17, 0.0))
