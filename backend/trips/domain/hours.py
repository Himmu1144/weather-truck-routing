"""When the truck is really at each point: driving time plus the legal rest breaks. Pure computation.

US hours-of-service rules for a property-carrying driver, as they apply to one trip of
pure driving by a fully rested driver:
- a 30-minute break once 8 hours have been driven since the last break or rest,
- 10 hours off once 11 hours have been driven since the last rest.
The other limits never bind here: the 14-hour duty window allows 11 h of driving plus
the 30-minute break, and the longest US trips are about 60 h of driving, under the
70-hour weekly limit. A break or rest is only taken if there is still driving to do.
"""

from bisect import bisect_left
from dataclasses import dataclass

HOUR = 3600
BREAK_AFTER, BREAK = 8 * HOUR, HOUR / 2
REST_AFTER, REST = 11 * HOUR, 10 * HOUR


@dataclass(frozen=True)
class Stop:
    drive_seconds: float     # driving done when it starts
    duration_seconds: float
    kind: str                # 'break' (30 min) or 'rest' (10 h)


def stops_for(total_drive_seconds):
    stops = []
    driven = since_break = since_rest = 0.0
    while True:
        leg = min(total_drive_seconds - driven, BREAK_AFTER - since_break, REST_AFTER - since_rest)
        driven += leg
        since_break += leg
        since_rest += leg
        if driven >= total_drive_seconds:
            return tuple(stops)
        if since_rest >= REST_AFTER:
            stops.append(Stop(driven, REST, 'rest'))
            since_break = since_rest = 0.0
        else:
            stops.append(Stop(driven, BREAK, 'break'))
            since_break = 0.0


def elapsed(drive_seconds, stops):
    """Time since departure when the truck has driven this long. At a stop's own point the
    truck has just arrived, so that stop isn't counted yet."""
    return drive_seconds + sum(stop.duration_seconds for stop in stops if stop.drive_seconds < drive_seconds)


def mile_at(drive_seconds, timeline):
    """Where the truck is after driving this long. timeline: (mile, drive_seconds) pairs along
    the route, both increasing, from (0, 0) to the destination."""
    times = [seconds for _, seconds in timeline]
    i = min(max(bisect_left(times, drive_seconds), 1), len(timeline) - 1)
    (mile_a, time_a), (mile_b, time_b) = timeline[i - 1], timeline[i]
    if time_b == time_a:
        return mile_b
    return mile_a + (mile_b - mile_a) * (drive_seconds - time_a) / (time_b - time_a)
