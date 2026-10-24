from unittest import TestCase

from trips.domain.risk import Level, assess

L, M, H, S, N = Level.LOW, Level.MODERATE, Level.HIGH, Level.SEVERE, Level.NO_TRAVEL


class BandEdgeTests(TestCase):
    """Every edge in the brief's table, with an empty truck so no load rule applies."""

    def check(self, cases, reading):
        for value, expected in cases:
            with self.subTest(value=value):
                self.assertEqual(assess(**reading(value), load_lb=0).level, expected)

    def test_wind(self):
        self.check([(0, L), (24.9, L), (25, M), (34.9, M), (35, H), (44.9, H),
                    (45, S), (54.9, S), (55, N), (80, N)],
                   lambda v: {'wind_mph': v, 'rain_in_hr': 0, 'snow_in_hr': 0})

    def test_rain(self):
        self.check([(0.09, L), (0.10, M), (0.24, M), (0.25, H), (0.49, H),
                    (0.50, S), (1.00, S), (1.01, N)],
                   lambda v: {'wind_mph': 0, 'rain_in_hr': v, 'snow_in_hr': 0})

    def test_snow(self):
        self.check([(0.49, L), (0.5, M), (0.99, M), (1.0, H), (1.99, H),
                    (2.0, S), (3.0, S), (3.01, N)],
                   lambda v: {'wind_mph': 0, 'rain_in_hr': 0, 'snow_in_hr': v})


class LoadRuleTests(TestCase):
    def check(self, wind_mph, load_lb, expected, raised):
        with self.subTest(wind_mph=wind_mph, load_lb=load_lb):
            result = assess(wind_mph, 0, 0, load_lb)
            self.assertEqual(result.level, expected)
            self.assertEqual(result.load_raised_wind, raised)

    def test_45_to_54_mph_over_30000_lb_is_no_travel(self):
        self.check(47, 30_000, S, False)    # "more than": exactly 30,000 doesn't count
        self.check(47, 30_001, N, True)
        self.check(45, 30_001, N, True)
        self.check(54.9, 80_000, N, True)

    def test_35_to_44_mph_over_40000_lb_is_severe(self):
        self.check(40, 40_000, H, False)
        self.check(40, 40_001, S, True)
        self.check(35, 40_001, S, True)
        self.check(44.9, 80_000, S, True)
        self.check(40, 35_000, H, False)    # over 30,000 only matters at 45-54 mph

    def test_55_mph_is_no_travel_for_any_load(self):
        self.check(55, 0, N, False)
        self.check(55, 80_000, N, False)

    def test_load_never_changes_other_winds(self):
        self.check(34.9, 80_000, M, False)
        self.check(10, 80_000, L, False)


class CombinedTests(TestCase):
    def test_worst_condition_decides_and_is_named(self):
        result = assess(wind_mph=30, rain_in_hr=0.6, snow_in_hr=0, load_lb=0)
        self.assertEqual(result.level, S)
        self.assertEqual(result.causes, ('rain',))
        self.assertEqual(result.reason, 'Severe: rain 0.60 in/hr')

    def test_conditions_at_the_same_level_are_all_named(self):
        result = assess(wind_mph=36, rain_in_hr=0.3, snow_in_hr=0, load_lb=0)
        self.assertEqual(result.causes, ('wind', 'rain'))
        self.assertEqual(result.reason, 'High: wind 36.0 mph and rain 0.30 in/hr')

    def test_reason_says_what_the_load_did(self):
        result = assess(wind_mph=47, rain_in_hr=0, snow_in_hr=0, load_lb=35_000)
        self.assertEqual(result.reason,
                         'No Travel: wind 47.0 mph with a 35,000 lb load (Severe at 30,000 lb or less)')

    def test_low(self):
        result = assess(wind_mph=12, rain_in_hr=0.02, snow_in_hr=0, load_lb=20_000)
        self.assertEqual(result.level, L)
        self.assertEqual(result.causes, ())
        self.assertEqual(result.reason, 'Low: no condition reaches Moderate')


class RawReadingTests(TestCase):
    def test_readings_are_not_rounded_before_classification(self):
        for wind, rain, snow, expected in [
            (24.99, 0, 0, L), (0, 1.001, 0, N),
            (0, 0, 3.01, N), (0, 0.249, 0, M),
        ]:
            with self.subTest(wind=wind, rain=rain, snow=snow):
                self.assertEqual(assess(wind, rain, snow, 0).level, expected)

    def test_reasons_keep_enough_precision_to_explain_the_band(self):
        for readings, expected in [
            ((34.96, 0, 0), 'Moderate: wind 34.96 mph'),
            ((0, 1.001, 0), 'No Travel: rain 1.001 in/hr'),
            ((0, 0.249, 0), 'Moderate: rain 0.249 in/hr'),
            ((0, 0, 3.01), 'No Travel: snow 3.01 in/hr'),
        ]:
            with self.subTest(readings=readings):
                self.assertEqual(assess(*readings, 0).reason, expected)
