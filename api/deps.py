"""Caché y tokens compartidos por los routers."""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from typing import Any

from core.auth import DeviceFlowRequired, acquire_token, complete_device_flow, token_silencioso

log = logging.getLogger("api.cache")

_cache: dict[str, tuple[float, Any]] = {}
_cache_lock = threading.Lock()
TTL_FUENTES = 3600


class AuthPendiente(Exception):
    def __init__(self, destino: str):
        self.destino = destino
        super().__init__(f"Autenticación requerida: {destino}")


class DatosPreparando(Exception):
    def __init__(self, clave: str):
        self.clave = clave
        super().__init__(f"Preparando los datos: {clave}")


_pendientes: dict[str, dict] = {}
_auth_lock = threading.Lock()


def get_token(destino: str) -> str:
    token = token_silencioso(destino)  # type: ignore[arg-type]
    if token:
        with _auth_lock:
            info = _pendientes.get(destino)
            if info:
                info["estado"] = "ok"
                info["error"] = None
        return token
    with _auth_lock:
        actual = _pendientes.get(destino)
        if actual and actual["estado"] == "esperando":
            raise AuthPendiente(destino)
        guardado = actual.get("token") if actual and actual["estado"] == "ok" else None
    if guardado:
        return guardado
    try:
        return acquire_token(destino)  # type: ignore[arg-type]
    except DeviceFlowRequired as pending:
        with _auth_lock:
            actual = _pendientes.get(destino)
            if not actual or actual["estado"] != "esperando":
                info = {
                    "destino": destino,
                    "estado": "esperando",
                    "user_code": pending.user_code,
                    "verification_uri": pending.verification_uri,
                    "error": None,
                }
                _pendientes[destino] = info
                threading.Thread(target=_completar, args=(pending, info), daemon=True).start()
        raise AuthPendiente(destino) from None


def _completar(pending: DeviceFlowRequired, info: dict) -> None:
    try:
        info["token"] = complete_device_flow(pending)
        info["estado"] = "ok"
    except Exception as exc:
        info["estado"] = "error"
        info["error"] = str(exc)


def estado_auth() -> list[dict]:
    with _auth_lock:
        return [{k: v for k, v in p.items() if k != "token"} for p in _pendientes.values()]


def cached(key: str, ttl: int, fn: Callable[[], Any]) -> Any:
    ahora = time.time()
    with _cache_lock:
        hit = _cache.get(key)
    if hit and hit[0] > ahora:
        return hit[1]
    value = fn()
    with _cache_lock:
        _cache[key] = (ahora + ttl, value)
    return value


def invalidar(prefijo: str = "") -> None:
    with _cache_lock:
        for k in [k for k in _cache if k.startswith(prefijo)]:
            del _cache[k]
