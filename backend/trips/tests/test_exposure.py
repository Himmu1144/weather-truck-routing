import random
from unittest import TestCase

from trips.domain.exposure import Stretch, exposure
from trips.domain.risk import Level

L, M, H, S, N = Level.LOW, Level.MODERATE, Level.HIGH, Level.SEVERE, Level.NO_TRAVEL


class ExposureTests(TestCase):
    def test_each_checkpoint_covers_halfway_to_its_neighbours(self):
        result = exposure([(0, L), (25, S), (50, L)], 50)
        self.assertEqual(result.stretches, (Stretch(0, 12.5, L), Stretch(12.5, 37.5, S), Stretch(37.5, 50, L)))
        self.assertEqual(result.miles[L], 25)
        self.assertEqual(result.miles[S], 25)
        self.assertEqual(result.average_risk, 1.5)    # 25 mi x 3 / 50 mi

    def test_short_last_gap_before_the_destination(self):
        # every 25 mi, and the destination at mile 60
        result = exposure([(0, L), (25, L), (50, H), (60, H)], 60)
        self.assertEqual(result.stretches, (Stretch(0, 37.5, L), Stretch(37.5, 60, H)))
        self.assertEqual(result.miles[H], 22.5)

    def test_every_level_is_reported(self):
        result = exposure([(0, L), (10, L)], 10)
        self.assertEqual(result.miles, {L: 10, M: 0, H: 0, S: 0, N: 0})
        self.assertEqual(result.average_risk, 0)

    def test_one_checkpoint_covers_the_whole_route(self):
        result = exposure([(0, M)], 8)
        self.assertEqual(result.stretches, (Stretch(0, 8, M),))
        self.assertEqual(result.average_risk, 1)

    def test_miles_always_add_up_to_the_route(self):
        rng = random.Random(1)
        for _ in range(200):
            total = rng.uniform(5, 3000)
            spacing = rng.choice([10, 25, 50])
            marks = [m for m in range(0, int(total), spacing)] + [total]
            result = exposure([(m, rng.choice(list(Level))) for m in marks], total)
            self.assertAlmostEqual(sum(result.miles.values()), total, places=6)
            self.assertAlmostEqual(sum(s.end_mile - s.start_mile for s in result.stretches), total, places=6)
            self.assertTrue(0 <= result.average_risk <= 4)

    def test_bad_input_is_refused(self):
        for checkpoints, total in [([], 10), ([(0, L), (5, L)], 0), ([(5, L), (0, L)], 10), ([(0, L), (12, L)], 10)]:
            with self.subTest(checkpoints=checkpoints, total=total):
                with self.assertRaises(ValueError):
                    exposure(checkpoints, total)
