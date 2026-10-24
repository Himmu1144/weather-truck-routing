"""Distances and shapes on the Earth. Points are (longitude, latitude) in degrees."""

from bisect import bisect_left
from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_MILES = 3958.8
KM_PER_MILE = 1.609344
MILES_PER_DEGREE_LAT = 69.05


def haversine_miles(a, b):
    lon1, lat1, lon2, lat2 = map(radians, (*a, *b))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * asin(sqrt(h))


def point_at(line, miles, mile):
    """The point `mile` miles along a line whose points sit at `miles` from its start."""
    i = min(max(bisect_left(miles, mile), 1), len(line) - 1)
    span = miles[i] - miles[i - 1]
    t = 0.0 if span == 0 else min(max((mile - miles[i - 1]) / span, 0.0), 1.0)
    (lon_a, lat_a), (lon_b, lat_b) = line[i - 1], line[i]
    return lon_a + (lon_b - lon_a) * t, lat_a + (lat_b - lat_a) * t


def samples(line, miles, step):
    """Points every `step` miles along the line."""
    count = int(miles[-1] // step) + 1
    return [point_at(line, miles, k * step) for k in range(count)] + [line[-1]]


def offset(point, toward, distance_miles, side):
    """A point `distance_miles` to the left (side=+1) or right (side=-1) of the direction
    from `point` toward `toward`, on a flat local approximation."""
    scale = cos(radians(point[1]))
    dx, dy = (toward[0] - point[0]) * scale, toward[1] - point[1]
    length = sqrt(dx * dx + dy * dy) or 1.0
    left_x, left_y = -dy / length * side, dx / length * side
    degrees = distance_miles / MILES_PER_DEGREE_LAT
    return point[0] + left_x * degrees / scale, point[1] + left_y * degrees


# Comparing routes: each route is sampled every half mile, and each sample is put in a
# grid cell of about 0.35 by 0.35 miles. Two samples "touch" if their cells are neighbours,
# so roads within about half a mile of each other count as the same road.
SAMPLE_MILES = 0.5
CELL_DEGREES = 0.005


def _cell(point):
    return round(point[0] / CELL_DEGREES), round(point[1] / CELL_DEGREES)


def _near(cell, cells):
    x, y = cell
    return any((x + dx, y + dy) in cells for dx in (-1, 0, 1) for dy in (-1, 0, 1))


def shared_share(line, miles, other_line, other_miles):
    """The share of the first route that runs along the second (0 to 1)."""
    other = {_cell(p) for p in samples(other_line, other_miles, SAMPLE_MILES)}
    points = samples(line, miles, SAMPLE_MILES)
    return sum(_near(_cell(p), other) for p in points) / len(points)


def doubled_back_miles(line, miles, gap_miles=4):
    """Miles where the route comes back within half a mile of where it was more than
    `gap_miles` earlier: the out-and-back spur a route makes to reach a via point."""
    first_seen, doubled = {}, 0
    for index, point in enumerate(samples(line, miles, SAMPLE_MILES)):
        x, y = cell = _cell(point)
        earlier = [first_seen[c] for c in ((x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1))
                   if c in first_seen]
        if earlier and (index - min(earlier)) * SAMPLE_MILES > gap_miles:
            doubled += 1
        first_seen.setdefault(cell, index)
    return doubled * SAMPLE_MILES
