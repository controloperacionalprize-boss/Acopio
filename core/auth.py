"""Login MSAL (device flow) para SharePoint OneDrive personal."""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Literal

from core.errors import AuthError, DeviceFlowRequired

DestinoAuth = Literal["sharepoint_my"]

_apps: dict[str, object] = {}
_caches: dict[str, object] = {}
_lock_cache = threading.Lock()

_CLIENT_OFFICE = "d3590ed6-52b3-4102-aeff-aad2292ab01c"
_AUTHORITY_COMMON = "https://login.microsoftonline.com/common"


def _dir_cache() -> Path:
    base = os.environ.get("MSAL_CACHE_DIR") or os.path.join(
        os.environ.get("LOCALAPPDATA") or os.path.expanduser("~/.cache"), "Acopio"
    )
    return Path(base)


def _archivo_cache(destino: str) -> Path:
    return _dir_cache() / f"msal_{destino}.json"


def _guardar_cache(destino: str, forzar: bool = False) -> None:
    cache = _caches.get(destino)
    if cache is None or (not forzar and not cache.has_state_changed):
        return
    with _lock_cache:
        ruta = _archivo_cache(destino)
        ruta.parent.mkdir(parents=True, exist_ok=True)
        texto = cache.serialize()
        tmp = ruta.with_suffix(".tmp")
        tmp.write_text(texto, encoding="utf-8")
        try:
            os.chmod(tmp, 0o600)
        except OSError:
            pass
        os.replace(tmp, ruta)
        cache.has_state_changed = False


def msal_config(destino: DestinoAuth) -> dict[str, str | list[str]]:
    if destino == "sharepoint_my":
        return {
            "client_id": _CLIENT_OFFICE,
            "authority": _AUTHORITY_COMMON,
            "scopes": ["https://aquanqape-my.sharepoint.com/.default"],
        }
    raise ValueError(f"destino MSAL desconocido: {destino}")


def _app(destino: DestinoAuth):
    import msal

    if destino not in _apps:
        cfg = msal_config(destino)
        cache = msal.SerializableTokenCache()
        ruta = _archivo_cache(destino)
        if ruta.is_file():
            try:
                cache.deserialize(ruta.read_text(encoding="utf-8"))
            except Exception:
                pass
        _caches[destino] = cache
        _apps[destino] = msal.PublicClientApplication(
            client_id=cfg["client_id"],
            authority=cfg["authority"],
            token_cache=cache,
        )
    return _apps[destino]


def token_silencioso(destino: DestinoAuth) -> str | None:
    cfg = msal_config(destino)
    scopes = list(cfg["scopes"])
    app = _app(destino)
    accounts = app.get_accounts()
    if not accounts:
        return None
    result = app.acquire_token_silent(scopes, account=accounts[0])
    if result and "access_token" in result:
        _guardar_cache(destino, forzar=True)
        return result["access_token"]
    return None


def acquire_token(destino: DestinoAuth) -> str:
    token = token_silencioso(destino)
    if token:
        return token
    cfg = msal_config(destino)
    scopes = list(cfg["scopes"])
    app = _app(destino)
    flow = app.initiate_device_flow(scopes=scopes)
    if "user_code" not in flow:
        raise AuthError("No se pudo iniciar el flujo de autenticación.")
    raise DeviceFlowRequired(flow, destino)


def complete_device_flow(pending: DeviceFlowRequired) -> str:
    app = _app(pending.destino)  # type: ignore[arg-type]
    result = app.acquire_token_by_device_flow(pending.flow)
    if "access_token" not in result:
        raise AuthError(str(result.get("error_description", result)))
    _guardar_cache(pending.destino, forzar=True)
    return result["access_token"]


def cerrar_sesion() -> None:
    for destino in list(_apps):
        _apps.pop(destino, None)
        _caches.pop(destino, None)
    for archivo in _dir_cache().glob("msal_*.json"):
        archivo.unlink(missing_ok=True)
