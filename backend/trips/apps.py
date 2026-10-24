from django.apps import AppConfig


class TripsConfig(AppConfig):
    name = 'trips'

    def ready(self):
        # The town list takes ~0.4 s to read; do it at start, not on someone's first keystroke.
        from . import places
        places.load()
