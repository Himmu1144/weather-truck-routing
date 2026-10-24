"""Which route to recommend, and why. Pure computation: no Django, no I/O.

Routes are ranked in the brief's order, with No Travel added in front because the
brief's list leaves it out and it is worse than Severe:
  0. fewest No Travel miles   1. fewest Severe miles   2. fewest High miles
  3. lowest average risk      4. shortest travel time (arrival, with rest breaks)
The first criterion that differs decides. Values are compared as shown on screen
(0.1 mi, 0.01 average, whole minutes), so rounding noise never decides and the
reason never contradicts the numbers on the page.
"""

from dataclasses import dataclass

from .risk import Level


@dataclass(frozen=True)
class RouteSummary:
    name: str            # 'A', 'B', 'C'
    exposure: object     # exposure.Exposure
    travel_seconds: float


@dataclass(frozen=True)
class Ranking:
    order: tuple         # route names, best first
    recommended: str
    reason: str
    not_chosen: dict     # route name -> one line on why it lost
    warning: str | None  # set when even the recommended route has Severe or No Travel miles


def duration(seconds):
    minutes = round(seconds / 60)
    hours, minutes = divmod(minutes, 60)
    return f'{hours} h {minutes} min' if hours else f'{minutes} min'


def _miles(level):
    return lambda route: round(route.exposure.miles[level], 1)


# (what it compares, the value in full, the value alone)
CRITERIA = [
    (_miles(Level.NO_TRAVEL), lambda v: f'{v:g} mi of No Travel weather', lambda v: f'{v:g} mi'),
    (_miles(Level.SEVERE), lambda v: f'{v:g} mi of Severe weather', lambda v: f'{v:g} mi'),
    (_miles(Level.HIGH), lambda v: f'{v:g} mi of High-risk weather', lambda v: f'{v:g} mi'),
    (lambda route: round(route.exposure.average_risk, 2), lambda v: f'an average risk of {v:.2f}', lambda v: f'{v:.2f}'),
    (lambda route: round(route.travel_seconds / 60), lambda v: duration(v * 60), lambda v: duration(v * 60)),
]


def _deciding(best, other):
    """The first criterion on which `best` beats `other`, or None if they tie on all."""
    for index, (value, _, _) in enumerate(CRITERIA):
        if value(best) != value(other):
            return index
    return None


def rank(routes):
    if not routes:
        raise ValueError('No routes to rank.')
    ordered = sorted(routes, key=lambda route: tuple(criterion[0](route) for criterion in CRITERIA))
    best = ordered[0]

    not_chosen = {}
    for other in ordered[1:]:
        index = _deciding(best, other)
        if index is None:
            not_chosen[other.name] = f'Ties with Route {best.name} on weather and time.'
            continue
        value, full, short = CRITERIA[index]
        if index == len(CRITERIA) - 1:
            not_chosen[other.name] = f'Same weather risk, but slower: {full(value(other))} vs {short(value(best))}.'
        else:
            not_chosen[other.name] = f'Has {full(value(other))}, against {short(value(best))} on Route {best.name}.'

    return Ranking(tuple(route.name for route in ordered), best.name, _reason(best, ordered), not_chosen,
                   _warning(best))


def _reason(best, ordered):
    if len(ordered) == 1:
        return f'Route {best.name} is the only route found.'
    runner_up = ordered[1]
    index = _deciding(best, runner_up)
    if index is None:
        return f'Routes {best.name} and {runner_up.name} are equal on weather and time.'

    value, full, short = CRITERIA[index]
    if index == len(CRITERIA) - 1:
        return (f'Route {best.name} is the fastest, with weather risk equal to Route {runner_up.name}: '
                f'{full(value(best))} vs {short(value(runner_up))}.')

    reason = f'Route {best.name} has {full(value(best))}, against {short(value(runner_up))} on Route {runner_up.name}.'
    fastest = min(ordered, key=lambda route: route.travel_seconds)
    extra = round(best.travel_seconds / 60) - round(fastest.travel_seconds / 60)
    if extra > 0:
        reason += f' The safer weather costs {duration(extra * 60)} over Route {fastest.name}, the fastest.'
    return reason


def _warning(best):
    no_travel, severe = best.exposure.miles[Level.NO_TRAVEL], best.exposure.miles[Level.SEVERE]
    if round(no_travel, 1) > 0:
        return (f'Even the safest route crosses {no_travel:.1f} mi of No Travel weather. '
                'Consider a later departure.')
    if round(severe, 1) > 0:
        return f'Even the safest route has {severe:.1f} mi of Severe weather.'
    return None
