"""Distances on the Earth. Points are (longitude, latitude) in degrees."""

from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_MILES = 3958.8
KM_PER_MILE = 1.609344


def haversine_miles(a, b):
    lon1, lat1, lon2, lat2 = map(radians, (*a, *b))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * asin(sqrt(h))
