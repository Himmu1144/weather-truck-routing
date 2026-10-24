from unittest import TestCase

from trips.domain.exposure import Exposure
from trips.domain.ranking import RouteSummary, rank
from trips.domain.risk import Level

L, M, H, S, N = Level.LOW, Level.MODERATE, Level.HIGH, Level.SEVERE, Level.NO_TRAVEL


def route(name, hours, **miles):
    """A route of 1,000 miles: the given miles per level, Low for the rest."""
    by_level = {level: 0.0 for level in Level}
    for key, value in miles.items():
        by_level[Level[key.upper()]] = value
    by_level[L] = 1000 - sum(by_level.values())
    average = sum(level * value for level, value in by_level.items()) / 1000
    return RouteSummary(name, Exposure(by_level, average, ()), hours * 3600)


class OrderTests(TestCase):
    def test_each_criterion_decides_when_the_earlier_ones_tie(self):
        cases = [
            ('No Travel miles', route('A', 10, no_travel=5), route('B', 20, no_travel=0, severe=300)),
            ('Severe miles', route('A', 10, severe=5), route('B', 20, severe=0, high=300)),
            ('High miles', route('A', 10, high=5), route('B', 20, high=0, moderate=300)),
            ('average risk', route('A', 10, moderate=50), route('B', 20, moderate=0)),
            ('time', route('A', 20), route('B', 10)),
        ]
        for criterion, worse, better in cases:
            with self.subTest(criterion=criterion):
                self.assertEqual(rank([worse, better]).order, ('B', 'A'))

    def test_differences_too_small_to_show_do_not_decide(self):
        # 0.04 mi of Severe rounds to 0.0 mi, so the faster route wins on time
        self.assertEqual(rank([route('A', 20, severe=0), route('B', 10, severe=0.04)]).recommended, 'B')


class ReasonTests(TestCase):
    def test_safer_but_slower_states_the_time_cost(self):
        ranking = rank([route('A', 17.8, moderate=50), route('B', 19.9), route('C', 23.7, moderate=75)])
        self.assertEqual(ranking.order, ('B', 'A', 'C'))
        self.assertEqual(ranking.reason, 'Route B has an average risk of 0.00, against 0.05 on Route A. '
                                         'The safer weather costs 2 h 6 min over Route A, the fastest.')
        self.assertEqual(ranking.not_chosen, {'A': 'Has an average risk of 0.05, against 0.00 on Route B.',
                                              'C': 'Has an average risk of 0.07, against 0.00 on Route B.'})

    def test_weather_decides_on_miles(self):
        ranking = rank([route('A', 10, severe=25), route('B', 10)])
        self.assertEqual(ranking.reason, 'Route B has 0 mi of Severe weather, against 25 mi on Route A.')

    def test_equal_weather_picks_the_fastest(self):
        ranking = rank([route('A', 19.9), route('B', 17.8)])
        self.assertEqual(ranking.reason, 'Route B is the fastest, with weather risk equal to Route A: '
                                         '17 h 48 min vs 19 h 54 min.')
        self.assertEqual(ranking.not_chosen['A'], 'Same weather risk, but slower: 19 h 54 min vs 17 h 48 min.')


class WarningTests(TestCase):
    def test_warns_when_even_the_best_route_is_dangerous(self):
        self.assertEqual(rank([route('A', 10, no_travel=12, severe=3), route('B', 10, no_travel=20)]).warning,
                         'Even the safest route crosses 12.0 mi of No Travel weather. Consider a later departure.')
        self.assertEqual(rank([route('A', 10, severe=8)]).warning,
                         'Even the safest route has 8.0 mi of Severe weather.')

    def test_no_warning_when_the_best_route_is_clear(self):
        self.assertIsNone(rank([route('A', 10, high=40), route('B', 10, severe=5)]).warning)
