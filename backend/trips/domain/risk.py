"""Weather risk at one checkpoint, by the brief's table and load rules. Pure computation: no Django, no I/O.

How the table is read:
- Neighbouring bands share an edge (rain 0.10-0.25 and 0.25-0.50), so a value exactly on
  an edge takes the higher, safer band: 0.25 in/hr is High, 35 mph is High.
- No Travel follows the table's own sign: wind of 55 mph is No Travel (">= 55"), but rain of
  exactly 1.00 in/hr and snow of exactly 3.0 in/hr stay Severe ("> 1.00", "> 3.0").
- Readings are rounded to the precision shown on screen before they are classified, so the
  value a driver sees always matches its level.
- Wind is the steady wind; gusts are shown elsewhere but not scored.
- A checkpoint takes its worst condition. The load rules only ever raise the wind's level.
"""

from dataclasses import dataclass
from enum import IntEnum


class Level(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self):
        return self.name.replace('_', ' ').title()


# The lower edge of Moderate, High, Severe and No Travel.
WIND_MPH = (25, 35, 45, 55)
RAIN_IN_HR = (0.10, 0.25, 0.50, 1.00)
SNOW_IN_HR = (0.5, 1.0, 2.0, 3.0)

# Load rules: a load over the limit turns wind of that level into the next one.
#   45-54 mph with more than 30,000 lb: No Travel
#   35-44 mph with more than 40,000 lb: Severe
LOAD_RULES = {Level.SEVERE: 30_000, Level.HIGH: 40_000}


def band(value, edges, *, no_travel_includes_edge):
    if value > edges[3] or (no_travel_includes_edge and value == edges[3]):
        return Level.NO_TRAVEL
    for level, edge in ((Level.SEVERE, edges[2]), (Level.HIGH, edges[1]), (Level.MODERATE, edges[0])):
        if value >= edge:
            return level
    return Level.LOW


@dataclass(frozen=True)
class Assessment:
    level: Level
    wind: Level             # after the load rules
    rain: Level
    snow: Level
    causes: tuple           # the conditions that set the level, e.g. ('rain',); empty when Low
    load_raised_wind: bool  # True when the load made the wind's level worse
    reason: str             # e.g. "Severe: rain 0.60 in/hr"


def assess(wind_mph, rain_in_hr, snow_in_hr, load_lb):
    wind_mph, rain_in_hr, snow_in_hr = round(wind_mph, 1), round(rain_in_hr, 2), round(snow_in_hr, 2)

    wind_by_table = band(wind_mph, WIND_MPH, no_travel_includes_edge=True)
    limit = LOAD_RULES.get(wind_by_table)
    load_raised_wind = limit is not None and load_lb > limit
    levels = {
        'wind': Level(wind_by_table + 1) if load_raised_wind else wind_by_table,
        'rain': band(rain_in_hr, RAIN_IN_HR, no_travel_includes_edge=False),
        'snow': band(snow_in_hr, SNOW_IN_HR, no_travel_includes_edge=False),
    }
    level = max(levels.values())
    causes = tuple(name for name, value in levels.items() if value == level and level > Level.LOW)

    if not causes:
        reason = 'Low: no condition reaches Moderate'
    else:
        parts = {
            'wind': f'wind {wind_mph:.1f} mph' + (
                f' with a {load_lb:,} lb load ({wind_by_table.label} at {limit:,} lb or less)'
                if load_raised_wind else ''),
            'rain': f'rain {rain_in_hr:.2f} in/hr',
            'snow': f'snow {snow_in_hr:.2f} in/hr',
        }
        reason = f'{level.label}: ' + ' and '.join(parts[name] for name in causes)

    return Assessment(level, levels['wind'], levels['rain'], levels['snow'], causes, load_raised_wind, reason)
