from django.db import connection
from django.http import JsonResponse


def health(request):
    """Liveness and database check for Docker and the host."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    return JsonResponse({"status": "ok"})
