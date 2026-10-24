from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import exception_handler

from .places import search_addresses, search_towns
from .planner import plan_trip
from .routing import NoRoute, RoutingUnavailable
from .serializers import PlanRequestSerializer
from .weather import WeatherUnavailable

BUSY_RETRY_SECONDS = 30


def error(status, code, message, **extra):
    """Every error has one shape: {"error": {"code", "message", ...}}."""
    return Response({'error': {'code': code, 'message': message, **extra}}, status=status)


def api_exception_handler(exc, context):
    """DRF's own errors (bad JSON, wrong method) in the same shape."""
    response = exception_handler(exc, context)
    if response is not None:
        response.data = {'error': {'code': getattr(exc, 'default_code', 'error'),
                                   'message': str(response.data.get('detail', response.data))}}
    return response


@api_view(['GET'])
def health(request):
    return Response({'status': 'ok'})


@api_view(['GET'])
def places(request):
    """?q=den&source=towns (local, instant) or source=search (addresses, ZIP codes, ports)."""
    query = request.query_params.get('q', '')
    if request.query_params.get('source') != 'search':
        return Response({'results': search_towns(query)})
    found = search_addresses(query)
    if found is None:
        return Response({'results': [], 'unavailable': True})   # towns still work; the form says so
    return Response({'results': found})


@api_view(['POST'])
def plan(request):
    request_data = PlanRequestSerializer(data=request.data)
    if not request_data.is_valid():
        return error(400, 'invalid_request', 'Some fields need fixing.', fields=request_data.errors)
    try:
        return Response(plan_trip(**request_data.validated_data))
    except NoRoute:
        return error(422, 'no_route', 'No road connects these places.')
    except RoutingUnavailable:
        return error(502, 'routing_unavailable', 'The routing services are not responding. Try again shortly.')
    except WeatherUnavailable as exc:
        if exc.busy:
            response = error(503, 'weather_busy', str(exc), retry_after=BUSY_RETRY_SECONDS)
            response['Retry-After'] = str(BUSY_RETRY_SECONDS)
            return response
        return error(502, 'weather_unavailable', str(exc))
