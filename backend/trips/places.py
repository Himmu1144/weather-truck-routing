"""Place search for the origin and destination boxes, in two layers.

Towns come from a local list of US places (GeoNames, data/us_places.csv.gz), searched by
the start of the name and ranked by population: instant, and only ever in the USA.
Addresses, warehouses, ports, airports and ZIP codes come from Photon (OpenStreetMap,
free, no key): slower, so the browser asks it a moment after typing stops, and if it is
down the town search still works. Its answers are kept to the USA and to the kinds of
places a truck drives to.
"""

import csv
import difflib
import hashlib
import gzip
import re
import unicodedata
from bisect import bisect_left
from functools import cache
from pathlib import Path

import requests
from django.conf import settings
from django.core.cache import cache as django_cache

PLACES_FILE = Path(__file__).resolve().parent.parent / 'data' / 'us_places.csv.gz'
LIMIT = 6
# GeoNames also lists neighbourhoods and developments; these words mark the obvious ones.
NOT_A_TOWN = re.compile(r'\b(Subdivision|Addition|Downtown|City Center|International Center|Mobile Home Park|'
                        r'Trailer Park|Trailer Court|Apartments|Condominiums)$')

STATE_CODES = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA', 'Colorado': 'CO',
    'Connecticut': 'CT', 'Delaware': 'DE', 'District of Columbia': 'DC', 'Florida': 'FL', 'Georgia': 'GA',
    'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
    'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD', 'Massachusetts': 'MA',
    'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO', 'Montana': 'MT',
    'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM',
    'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
    'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
    'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
    'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
}

# Spelled-out forms, so "St. Louis", "Saint Louis" and "ST LOUIS" all match.
_PREFIXES = {'st': 'saint', 'ste': 'sainte', 'ft': 'fort', 'mt': 'mount',
             'n': 'north', 's': 'south', 'e': 'east', 'w': 'west'}


def normalize(name):
    """Reduce a place name to a key that survives case, accents and punctuation."""
    text = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower().replace("'", '')
    words = re.sub(r'[^a-z0-9]+', ' ', text).split()
    if words and words[0] in _PREFIXES:
        words[0] = _PREFIXES[words[0]]
    if len(words) > 1 and words[0] in ('mc', 'de', 'la', 'du'):
        words[:2] = [words[0] + words[1]]
    return ' '.join(words)


# Towns

def load():
    """Read the town list now (at server start) rather than on the first keystroke."""
    _towns()


@cache
def _towns():
    """One entry per place, sorted by key: (key, -population, name, state, lat, lon).
    The file also lists old and alternative names; only a place's own name is kept, so
    'fort w' suggests Fort Worth and not Cincinnati (once Fort Washington)."""
    best = {}
    with gzip.open(PLACES_FILE, 'rt', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            if normalize(row['name']) != row['key'] or NOT_A_TOWN.search(row['name']):
                continue
            population = int(row['population'])
            place = (row['name'], row['state'])
            if place not in best or population > best[place][1]:
                best[place] = (row['key'], population, float(row['latitude']), float(row['longitude']))
    towns = sorted((key, -population, name, state, lat, lon)
                   for (name, state), (key, population, lat, lon) in best.items())
    return towns, [town[0] for town in towns]


def search_towns(query, limit=LIMIT):
    key = normalize(query)
    if len(key) < 2:
        return []
    towns, keys = _towns()
    i = bisect_left(keys, key)
    matches = []
    while i < len(keys) and keys[i].startswith(key):
        matches.append(towns[i])
        i += 1
    if not matches and len(key.split()) <= 2:
        # Nothing starts with it: maybe a typo ("chicgo"). Only for short, town-like
        # searches, so "port of long beach" isn't read as a misspelt town.
        populated = [town for town in towns if town[1] < 0 and town[0][:1] == key[:1]]
        close = set(difflib.get_close_matches(key, [town[0] for town in populated], n=limit, cutoff=0.75))
        matches = [town for town in populated if town[0] in close]
    # Real towns first; places with no population (neighbourhood entries) only if needed.
    populated = [town for town in matches if town[1] < 0]
    if len(populated) >= limit:
        matches = populated
    matches.sort(key=lambda town: town[1])
    return [{'label': f'{name}, {state}', 'lat': lat, 'lon': lon, 'kind': 'town'}
            for _, _, name, state, lat, lon in matches[:limit]]


# Photon

# The kinds of OpenStreetMap places a truck doesn't drive to.
SKIPPED_KEYS = {'shop', 'amenity', 'leisure', 'tourism', 'craft', 'healthcare', 'historic', 'natural', 'waterway', 'boundary'}
# Towns come from the local list; the online search adds only what that list can't find.
TOWN_VALUES = {'city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'locality', 'county', 'state'}


def search_addresses(query, limit=LIMIT):
    """Addresses, businesses, ports, airports and ZIP codes. None if Photon fails or is too slow,
    so the answer can say "unavailable" rather than "nothing found"."""
    query = query.strip()
    if len(query) < 3:
        return []
    key = 'photon:' + hashlib.sha256(normalize(query).encode()).hexdigest()
    found = django_cache.get(key)
    if found is None:
        try:
            response = requests.get(settings.PHOTON_URL, timeout=settings.PHOTON_TIMEOUT, params={
                'q': query, 'limit': 15, 'lang': 'en', 'bbox': '-125,24,-66,50'},
                headers={'User-Agent': settings.ROUTING_USER_AGENT})
            features = response.json()['features'] if response.status_code == 200 else None
        except (requests.RequestException, ValueError, KeyError):
            features = None
        if features is None:
            return None
        found = list({place['label']: place for place in map(_address, features) if place}.values())
        django_cache.set(key, found, 24 * 60 * 60)
    return found[:limit]


def _address(feature):
    p = feature['properties']
    if p.get('countrycode') != 'US' or p.get('state') not in STATE_CODES or p.get('osm_key') in SKIPPED_KEYS:
        return None
    if p.get('osm_key') == 'place' and p.get('osm_value') in TOWN_VALUES:
        return None
    street = ' '.join(filter(None, [p.get('housenumber'), p.get('street')]))
    town = p.get('city') or p.get('county')
    first = p.get('name') or street or p.get('postcode')
    parts = [first, street if street != first else None, town if town != first else None,
             STATE_CODES[p['state']] + (f" {p['postcode']}" if p.get('postcode') and p.get('postcode') != first else '')]
    lon, lat = feature['geometry']['coordinates']
    return {'label': ', '.join(part for part in parts if part), 'lat': lat, 'lon': lon,
            'kind': p.get('osm_value') or p.get('type')}
