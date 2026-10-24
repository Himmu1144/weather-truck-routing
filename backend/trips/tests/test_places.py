"""Place search: towns from the real local list; Photon faked."""

from unittest.mock import MagicMock, patch

import requests
from django.core.cache import cache
from django.test import SimpleTestCase

from trips import places
from trips.places import search_addresses, search_towns


def labels(query):
    return [place['label'] for place in search_towns(query)]


class TownTests(SimpleTestCase):
    def test_start_of_a_name_biggest_first(self):
        self.assertEqual(labels('den')[:3], ['Denver, CO', 'Denton, TX', 'Denison, TX'])

    def test_one_entry_per_town(self):
        self.assertEqual(len(set(labels('denver'))), len(labels('denver')))

    def test_old_names_are_not_suggested(self):
        self.assertNotIn('Cincinnati, OH', labels('fort w'))    # once Fort Washington

    def test_abbreviations_and_typos(self):
        self.assertEqual(labels('st lou')[0], 'St. Louis, MO')
        self.assertEqual(labels('chicgo')[0], 'Chicago, IL')

    def test_neighbourhood_entries_are_left_out(self):
        self.assertEqual(labels('los angeles'), ['Los Angeles, CA', 'Los Angeles, TX'])

    def test_long_searches_are_not_guessed_as_misspelt_towns(self):
        self.assertEqual(labels('port of long beach'), [])


def photon(*features, status=200):
    fake = MagicMock(status_code=status)
    fake.json.return_value = {'features': list(features)}
    return fake


def feature(lon=-94.25, lat=36.32, **properties):
    return {'geometry': {'coordinates': [lon, lat]},
            'properties': {'countrycode': 'US', 'state': 'Arkansas', **properties}}


class AddressTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def search(self, response, query='walmart bentonville'):
        with patch.object(places.requests, 'get', **response) as get:
            return search_addresses(query), get

    def test_addresses_are_labelled_and_kept_to_the_usa(self):
        found, _ = self.search({'return_value': photon(
            feature(name='Walmart Distribution Center', city='Bentonville', osm_key='landuse', osm_value='industrial'),
            feature(name='Walmart Supercenter', city='Bentonville', osm_key='shop', osm_value='supermarket'),
            feature(name='Walmart', city='Toronto', countrycode='CA', state='Ontario', osm_key='building'),
            feature(housenumber='1600', street='Pennsylvania Avenue Northwest', name='White House',
                    city='Washington', state='District of Columbia', postcode='20500', osm_key='office'),
        )})
        self.assertEqual([place['label'] for place in found], [
            'Walmart Distribution Center, Bentonville, AR',
            'White House, 1600 Pennsylvania Avenue Northwest, Washington, DC 20500',
        ])

    def test_a_zip_code(self):
        found, _ = self.search({'return_value': photon(feature(postcode='75201', city='Dallas', state='Texas',
                                                               osm_key='place', osm_value='postcode'))}, '75201')
        self.assertEqual(found[0]['label'], '75201, Dallas, TX')

    def test_photon_down_gives_no_addresses_not_an_error(self):
        found, _ = self.search({'side_effect': requests.Timeout()})
        self.assertEqual(found, [])

    def test_repeat_searches_come_from_the_cache(self):
        response = {'return_value': photon(feature(name='Port of Long Beach', city='Long Beach', state='California'))}
        self.search(response)
        _, get = self.search(response)
        get.assert_not_called()


class EndpointTests(SimpleTestCase):
    def test_towns_by_default(self):
        results = self.client.get('/api/places/', {'q': 'seat'}).json()['results']
        self.assertEqual(results[0]['label'], 'Seattle, WA')
        self.assertEqual(results[0]['kind'], 'town')
