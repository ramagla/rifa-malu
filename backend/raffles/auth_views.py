import json
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

@csrf_exempt
@require_http_methods(['POST'])
def admin_login(request):
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'detail': 'Dados inválidos.'}, status=400)
    user = authenticate(request, username=body.get('username', ''), password=body.get('password', ''))
    if not user or not user.is_staff:
        return JsonResponse({'detail': 'Usuário ou senha inválidos.'}, status=401)
    login(request, user)
    return JsonResponse({'username': user.username, 'name': user.get_full_name() or user.username})

@require_http_methods(['GET'])
def admin_session(request):
    if not request.user.is_authenticated or not request.user.is_staff:
        return JsonResponse({'detail': 'Não autenticado.'}, status=401)
    return JsonResponse({'username': request.user.username, 'name': request.user.get_full_name() or request.user.username})

@require_http_methods(['POST'])
def admin_logout(request):
    logout(request)
    return JsonResponse({}, status=204)
