from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from .domain.geo import haversine_miles

# The contiguous United States: the trip must be drivable from one end to the other.
LAT_RANGE, LON_RANGE = (24.3, 49.5), (-125.0, -66.8)


class PlaceSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=200)
    lat = serializers.FloatField()
    lon = serializers.FloatField()

    def validate(self, place):
        if not (LAT_RANGE[0] <= place['lat'] <= LAT_RANGE[1] and LON_RANGE[0] <= place['lon'] <= LON_RANGE[1]):
            raise serializers.ValidationError('Pick a place in the contiguous United States.')
        return place


class PlanRequestSerializer(serializers.Serializer):
    origin = PlaceSerializer()
    destination = PlaceSerializer()
    departure = serializers.DateTimeField()
    load_lb = serializers.IntegerField(min_value=0, max_value=80_000)
    interval_mi = serializers.ChoiceField(choices=[10, 25, 50])
    rest_breaks = serializers.BooleanField(default=True)

    def validate_departure(self, departure):
        now = timezone.now()
        if departure < now - timedelta(hours=1):
            raise serializers.ValidationError('Departure can\'t be in the past.')
        if departure > now + timedelta(days=7):
            raise serializers.ValidationError('Departure must be within the next 7 days, while forecasts cover the trip.')
        return departure

    def validate(self, data):
        a, b = data['origin'], data['destination']
        if haversine_miles((a['lon'], a['lat']), (b['lon'], b['lat'])) < 1:
            raise serializers.ValidationError({'destination': 'Origin and destination are the same place.'})
        return data
