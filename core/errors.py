"""Excepciones del proyecto."""

from __future__ import annotations


class CoreError(Exception):
    pass


class FuenteError(CoreError):
    pass


class AuthError(CoreError):
    pass


class DeviceFlowRequired(Exception):
    def __init__(self, flow: dict, destino: str):
        self.flow = flow
        self.destino = destino
        self.user_code: str = flow.get("user_code", "")
        self.verification_uri: str = flow.get("verification_uri", "")
        super().__init__(f"Device flow requerido para {destino}")
