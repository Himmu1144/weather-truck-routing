"""How many miles of a route fall in each risk level. Pure computation: no Django, no I/O.

Each checkpoint stands for the road halfway to its neighbours on each side; the first
starts at the origin and the last runs to the destination, so the stretches add up to the
route's exact length. Average risk scores Low 0 to No Travel 4, weighted by miles.
"""

from dataclasses import dataclass

from .risk import Level


@dataclass(frozen=True)
class Stretch:
    start_mile: float
    end_mile: float
    level: Level


@dataclass(frozen=True)
class Exposure:
    miles: dict         # Level -> miles, every level present
    average_risk: float
    stretches: tuple    # the route in order, neighbouring stretches of one level merged


def exposure(checkpoints, total_miles):
    """checkpoints: (mile, level) pairs in route order, starting at the origin."""
    if total_miles <= 0:
        raise ValueError('A route needs a length.')
    marks = [mile for mile, _ in checkpoints]
    if not marks or marks != sorted(marks) or marks[0] < 0 or marks[-1] > total_miles:
        raise ValueError('Checkpoints must be in route order and on the route.')

    edges = [0.0] + [(a + b) / 2 for a, b in zip(marks, marks[1:])] + [total_miles]
    miles = {level: 0.0 for level in Level}
    stretches = []
    for (_, level), start, end in zip(checkpoints, edges, edges[1:]):
        miles[level] += end - start
        if stretches and stretches[-1].level == level:
            stretches[-1] = Stretch(stretches[-1].start_mile, end, level)
        else:
            stretches.append(Stretch(start, end, level))

    average_risk = sum(level * length for level, length in miles.items()) / total_miles
    return Exposure(miles, average_risk, tuple(stretches))
