"""API del portal Acopio."""

from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.deps import AuthPendiente, DatosPreparando
from api.routers import acopio, auth
from core.errors import CoreError

app = FastAPI(title="Portal Acopio")

_cors = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    *[o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()],
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, acopio.router):
    app.include_router(r)


@app.exception_handler(AuthPendiente)
def _auth_pendiente(request: Request, exc: AuthPendiente):
    return JSONResponse(status_code=401, content={"tipo": "auth", "destino": exc.destino})


@app.exception_handler(DatosPreparando)
def _preparando(request: Request, exc: DatosPreparando):
    resp = JSONResponse(status_code=503, content={"tipo": "preparando", "clave": exc.clave})
    resp.headers["Retry-After"] = "10"
    return resp


@app.exception_handler(CoreError)
def _core_error(request: Request, exc: CoreError):
    return JSONResponse(status_code=502, content={"tipo": "fuente", "detalle": str(exc)})


@app.get("/api/salud")
def salud():
    return {"ok": True}
