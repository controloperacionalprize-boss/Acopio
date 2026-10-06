"""Endpoints de autenticación: estado del device flow y cerrar sesión."""

from __future__ import annotations

from fastapi import APIRouter

from api.deps import estado_auth
from core.auth import cerrar_sesion

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/estado")
def estado():
    return {"pendientes": estado_auth()}


@router.post("/logout")
def logout():
    cerrar_sesion()
    return {"ok": True}
