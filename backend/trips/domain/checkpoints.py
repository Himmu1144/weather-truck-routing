"""Where the weather is checked along a route, and when the truck gets there. Pure computation.

A checkpoint sits at the origin, every `interval` miles, and at the destination. Its time
is the driving time to that mile plus any rest breaks taken before it (see hours.py), so
the forecast can be read for the hour the truck is really there.
"""

from bisect import bisect_left
from dataclasses import dataclass

from .geo import point_at
from .hours import elapsed, stops_for


@dataclass(frozen=True)
class Checkpoint:
    mile: float
    point: tuple             # (lon, lat)
    drive_seconds: float     # driving time from the origin
    elapsed_seconds: float   # time since departure, rest breaks included


@dataclass(frozen=True)
class RestStop:
    mile: float
    point: tuple
    elapsed_seconds: float   # when it starts, since departure
    duration_seconds: float
    kind: str                # 'break' (30 min) or 'rest' (10 h)


def _interpolate(xs, ys, x):
    i = min(max(bisect_left(xs, x), 1), len(xs) - 1)
    span = xs[i] - xs[i - 1]
    t = 0.0 if span == 0 else (x - xs[i - 1]) / span
    return ys[i - 1] + (ys[i] - ys[i - 1]) * t


def plan_checkpoints(route, interval_miles, *, rest_breaks=True):
    """route: anything with .line, .miles and .seconds (see routing.Route)."""
    stops = stops_for(route.seconds[-1]) if rest_breaks else ()
    total = route.miles[-1]

    marks = [k * interval_miles for k in range(int(total // interval_miles) + 1)]
    if total - marks[-1] > 1e-6:
        marks.append(total)

    checkpoints = []
    for mile in marks:
        drive = _interpolate(route.miles, route.seconds, mile)
        checkpoints.append(Checkpoint(mile, point_at(route.line, route.miles, mile), drive, elapsed(drive, stops)))

    rest_stops = []
    for stop in stops:
        mile = _interpolate(route.seconds, route.miles, stop.drive_seconds)
        rest_stops.append(RestStop(mile, point_at(route.line, route.miles, mile),
                                   elapsed(stop.drive_seconds, stops), stop.duration_seconds, stop.kind))
    return checkpoints, rest_stops
