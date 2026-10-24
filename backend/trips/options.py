"""Three route options a dispatcher would actually consider.

The router's own alternatives come first. If fewer than three survive, more are found
by routing through a point to either side of the fastest route's middle, at 15% and 25%
of the trip's straight-line distance (kept between 30 and 200 miles). Every option,
the router's or ours, must:
  - take at most 25% longer than the fastest,
  - share at most 70% of its length with each option already kept (90% for the
    router's own, which are only dropped when they are near-copies),
  - for our detours only, not double back on itself for more than a mile (a spur out
    to the via point; the router's own routes have none, and winding roads would
    trip the check).
If fewer than three pass, the trip shows what passed and says why: a padded option a
driver would never take is worse than an honest two.
"""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from .domain.geo import doubled_back_miles, haversine_miles, offset, point_at, shared_share
from .routing import NoRoute, RoutingUnavailable, get_routes

WANTED = 3
MAX_SLOWER = 1.25
MAX_SHARED = 0.70
MAX_SHARED_ROUTER = 0.90
MAX_DOUBLED_BACK_MILES = 1.0
OFFSET_SHARES = (0.15, 0.25)
MIN_OFFSET_MILES, MAX_OFFSET_MILES = 30, 200


@dataclass(frozen=True)
class Options:
    routes: list    # routing.Route, fastest first
    note: str | None


def route_options(origin, destination, load_lb):
    found = get_routes([origin, destination], load_lb)
    fastest = found[0]
    kept = [fastest]
    for route in found[1:]:
        if len(kept) < WANTED and _problem(route, fastest, kept, MAX_SHARED_ROUTER, detour=False) is None:
            kept.append(route)

    if len(kept) < WANTED:
        for route in _detours(origin, destination, fastest, load_lb):
            if len(kept) < WANTED and _problem(route, fastest, kept, MAX_SHARED, detour=True) is None:
                kept.append(route)

    kept.sort(key=lambda route: route.drive_seconds)
    note = None
    if len(kept) < WANTED:
        note = (f'Only {len(kept)} practical route{"s" if len(kept) > 1 else ""} found: other ways round '
                f'were over {MAX_SLOWER - 1:.0%} slower or used the same roads.')
    return Options(kept, note)


def _detours(origin, destination, fastest, load_lb):
    middle = point_at(fastest.line, fastest.miles, fastest.distance_miles / 2)
    straight = haversine_miles(origin, destination)
    vias = []
    for share in OFFSET_SHARES:
        distance = min(max(straight * share, MIN_OFFSET_MILES), MAX_OFFSET_MILES)
        vias += [offset(middle, destination, distance, side) for side in (1, -1)]

    def attempt(via):
        try:
            return get_routes([origin, via, destination], load_lb, alternatives=False)[0]
        except (NoRoute, RoutingUnavailable):
            return None   # e.g. the point is in the sea or the service failed this once

    with ThreadPoolExecutor(len(vias)) as pool:
        return sorted((route for route in pool.map(attempt, vias) if route),
                      key=lambda route: route.drive_seconds)


def _problem(route, fastest, kept, max_shared, *, detour):
    if route.drive_seconds > MAX_SLOWER * fastest.drive_seconds:
        return 'too slow'
    if detour and doubled_back_miles(route.line, route.miles) > MAX_DOUBLED_BACK_MILES:
        return 'doubles back'
    if any(shared_share(route.line, route.miles, other.line, other.miles) > max_shared for other in kept):
        return 'same roads'
    return None
