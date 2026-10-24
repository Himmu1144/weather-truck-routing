"""The forecast at each checkpoint, for the hour the truck is there. Data from Open-Meteo (free, no key).

Each point reads the forecast of the grid cell it falls in, and points in the same cell
share one lookup. Open-Meteo's free plan counts every location and allows 600 a minute,
so the grid adapts: 0.1 degree cells (about 7 miles, close to the forecast models' own
resolution) unless the trip would need more than WEATHER_MAX_LOCATIONS of them, then the
smallest coarser grid that fits. The limit is half the per-minute allowance, so a trip
and a second look at it (another interval, say) fit in one minute. Most trips use 7-mile
cells; a coast-to-coast trip with checkpoints every 10 miles on three routes needs about
700 of them and reads from 34-mile cells instead. Every checkpoint still gets its own
reading for its own hour.
Cells are fetched in batches, only for the days the trips need, in mph and inches,
and cached for 30 minutes. Each cell also says its time zone, so times can be shown in
the local time of the place.

Reading a forecast at a moment:
- wind and gusts are instantaneous, so they are blended between the two nearest hours;
- rain and snow are totals for the hour ending at each time stamp, so the truck gets
  the total of the hour it is driving through. Rain is rain plus showers (liquid only).
"""

import math
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime

import requests
from django.conf import settings
from django.core.cache import cache

HOUR = 3600
DAY = 24 * HOUR
HOURLY = 'wind_speed_10m,wind_gusts_10m,rain,showers,snowfall'
INCOMPLETE = 'The weather service returned incomplete data. Try again in a moment.'
GRIDS_DEGREES = (0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5)   # about 7 to 34 miles
MILES_PER_DEGREE = 69


class WeatherUnavailable(Exception):
    """The forecast service failed or refused."""

    def __init__(self, message, *, busy=False):
        super().__init__(message)
        self.busy = busy    # True when it is a rate limit: trying again shortly may work


@dataclass(frozen=True)
class Reading:
    wind_mph: float
    gust_mph: float
    rain_in_hr: float
    snow_in_hr: float
    time_zone: str      # e.g. 'America/Chicago'


@dataclass(frozen=True)
class Lookup:
    readings: list      # a Reading for each requested point, in order
    grid_miles: int     # the size of the cells the forecasts were read from


def readings(requests_at):
    """requests_at: [((lon, lat), unix_seconds), ...]."""
    if not requests_at:
        return Lookup([], 0)
    first = math.floor(min(t for _, t in requests_at) / HOUR) * HOUR
    last = math.ceil(max(t for _, t in requests_at) / HOUR) * HOUR
    for step in GRIDS_DEGREES:
        cells = {_cell(point, step) for point, _ in requests_at}
        if len(cells) <= settings.WEATHER_MAX_LOCATIONS:
            break
    forecasts = _forecasts(cells, first, last)
    return Lookup([_reading(forecasts[_cell(point, step)], when) for point, when in requests_at],
                  round(step * MILES_PER_DEGREE))


def _cell(point, step):
    return round(point[0] / step) * step, round(point[1] / step) * step


def _key(cell, first, last):
    return f'forecast:{cell[0]:.2f}:{cell[1]:.2f}:{first}:{last}'


def _forecasts(cells, first, last):
    found = {cell: cache.get(_key(cell, first, last)) for cell in cells}
    missing = sorted(cell for cell, forecast in found.items() if forecast is None)
    batches = [missing[i:i + settings.WEATHER_BATCH] for i in range(0, len(missing), settings.WEATHER_BATCH)]
    if batches:
        with ThreadPoolExecutor(min(len(batches), 3)) as pool:
            for batch, results in zip(batches, pool.map(lambda b: _fetch(b, first, last), batches)):
                for cell, forecast in zip(batch, results):
                    cache.set(_key(cell, first, last), forecast, settings.WEATHER_CACHE_SECONDS)
                    found[cell] = forecast
    return found


def _fetch(cells, first, last):
    # Days are in each place's local time, so a day either side covers every US time zone.
    def day(t):
        return datetime.fromtimestamp(t, UTC).date().isoformat()

    params = {
        'latitude': ','.join(f'{lat:.2f}' for _, lat in cells),
        'longitude': ','.join(f'{lon:.2f}' for lon, _ in cells),
        'hourly': HOURLY, 'wind_speed_unit': 'mph', 'precipitation_unit': 'inch',
        'timezone': 'auto', 'timeformat': 'unixtime', 'start_date': day(first - DAY), 'end_date': day(last + DAY),
    }
    try:
        response = requests.get(settings.OPEN_METEO_URL, params=params, timeout=settings.WEATHER_TIMEOUT)
    except requests.RequestException as error:
        raise WeatherUnavailable('The weather service is not responding.') from error
    if response.status_code == 429:
        # The per-minute limit clears in a minute; the hourly and daily ones don't, so waiting won't help.
        try:
            reason = str(response.json().get('reason', ''))
        except (ValueError, AttributeError):
            reason = ''
        if 'daily' in reason.lower() or 'hourly' in reason.lower():
            raise WeatherUnavailable(f'The free weather service has reached its {"daily" if "daily" in reason.lower() else "hourly"} '
                                     'limit for this server. Try again later.')
        raise WeatherUnavailable('The free weather service is busy. Try again in a minute.', busy=True)
    if response.status_code != 200:
        raise WeatherUnavailable('The weather service could not give a forecast for these dates.')
    try:
        data = response.json()
        data = data if isinstance(data, list) else [data]   # a single location comes back unwrapped
        return [{
            'time': entry['hourly']['time'],
            'wind': entry['hourly']['wind_speed_10m'],
            'gust': entry['hourly']['wind_gusts_10m'],
            'rain': [a + b if a is not None and b is not None else None
                     for a, b in zip(entry['hourly']['rain'], entry['hourly']['showers'])],
            'snow': entry['hourly']['snowfall'],
            'zone': entry['timezone'],
        } for entry in data]
    except (KeyError, TypeError, ValueError) as error:
        raise WeatherUnavailable(INCOMPLETE) from error


def _reading(forecast, when):
    try:
        times = forecast['time']
        if not times[0] <= when <= times[-1]:
            raise ValueError('Missing forecast hour')
        i = math.ceil((when - times[0]) / HOUR)   # the hour ending at or after `when`
        h = i - 1 if i > 0 else 0
        if times[i] != times[0] + i * HOUR or times[h] != times[0] + h * HOUR:
            raise ValueError('Missing forecast hour')
        t = 0.0 if i == h else (when - times[h]) / HOUR

        def value(values, index):
            reading = values[index]
            if reading is None or not math.isfinite(reading):
                raise ValueError('Missing weather reading')
            return reading

        def blend(values):
            b = value(values, i)
            if i == h or when == times[i]:
                return b
            a = value(values, h)
            return a + (b - a) * t

        return Reading(blend(forecast['wind']), blend(forecast['gust']),
                       value(forecast['rain'], i), value(forecast['snow'], i), forecast['zone'])
    except (KeyError, IndexError, TypeError, ValueError) as error:
        raise WeatherUnavailable(INCOMPLETE) from error
