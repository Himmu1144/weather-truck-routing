from dataclasses import replace
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

    def test_small_severe_difference_beats_travel_time(self):
        slower = route('A', 20, severe=1.03, moderate=0.03)   # equal average risk
        faster = route('B', 10, severe=1.04)
        self.assertEqual(rank([faster, slower]).recommended, 'A')
        self.assertEqual(rank([slower, faster]).recommended, 'A')

    def test_risk_miles_keep_their_precision(self):
        cases = [
            ({'no_travel': 1.03, 'severe': 0.1}, {'no_travel': 1.04}),
            ({'severe': 1.03, 'high': 0.1}, {'severe': 1.04}),
            ({'high': 1.03, 'moderate': 0.1}, {'high': 1.04}),
        ]
        for safer, worse in cases:
            with self.subTest(safer=safer):
                self.assertEqual(rank([route('B', 10, **worse), route('A', 20, **safer)]).recommended, 'A')

    def test_float_noise_defers_to_the_next_criterion(self):
        for level in ['no_travel', 'severe', 'high', 'moderate']:
            with self.subTest(level=level):
                self.assertEqual(rank([route('A', 20, **{level: 1}),
                                       route('B', 10, **{level: 1 + 1e-10})]).recommended, 'B')

    def test_travel_time_is_compared_in_seconds(self):
        slower = replace(route('A', 10), travel_seconds=36020)
        faster = replace(route('B', 10), travel_seconds=36010)
        self.assertEqual(rank([slower, faster]).recommended, 'B')

    def test_exact_ties_keep_input_order(self):
        ranking = rank([route('B', 10), route('A', 10)])
        self.assertEqual(ranking.order, ('B', 'A'))
        self.assertEqual(ranking.not_chosen['A'], 'Ties with Route B on weather and time.')


class ReasonTests(TestCase):
    def test_averages_shown_as_equal_choose_the_fastest(self):
        slower = route('B', 14, moderate=8)   # 0.008 and 0.012 both show 0.01
        faster = route('A', 10, moderate=12)
        for routes in [[slower, faster], [faster, slower]]:
            with self.subTest(order=[r.name for r in routes]):
                ranking = rank(routes)
                self.assertEqual(ranking.order, ('A', 'B'))
                self.assertEqual(ranking.reason, 'Route A is the fastest, with weather risk equal to Route B: '
                                                 '10 h 0 min vs 14 h 0 min.')
                self.assertEqual(ranking.not_chosen['B'], 'Same weather risk, but slower: 14 h 0 min vs 10 h 0 min.')
                self.assertNotIn('safer', ranking.reason)

    def test_average_risk_decides_only_when_the_shown_values_differ(self):
        for lower, higher in [(0.12, 0.15), (0.0049, 0.0051), (0.1049, 0.1051)]:
            with self.subTest(lower=lower, higher=higher):
                ranking = rank([route('A', 10, moderate=higher * 1000),
                                route('B', 14, moderate=lower * 1000)])
                low, high = f'{lower:.2f}', f'{higher:.2f}'
                self.assertNotEqual(low, high)
                self.assertEqual(ranking.recommended, 'B')
                self.assertEqual(ranking.reason,
                                 f'Route B has an average risk of {low}, against {high} on Route A. '
                                 'The safer weather costs 4 h 0 min over Route A, the fastest.')
                self.assertEqual(ranking.not_chosen['A'],
                                 f'Has an average risk of {high}, against {low} on Route B.')

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
