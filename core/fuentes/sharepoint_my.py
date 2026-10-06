"""Descarga de Excel desde OneDrive personal (SharePoint My) vía REST."""

from __future__ import annotations

from io import BytesIO

import pandas as pd
import requests

from core.errors import FuenteError

SP_MY_SITE = "https://aquanqape-my.sharepoint.com/personal/jcontreras_aquanqa_pe"
SP_MY_PATH = (
    "/personal/jcontreras_aquanqa_pe/Documents/"
    "Gi Cosecha y Operaciones/App_Sheet/Registros Campo/Registros Acopio.xlsx"
)


def descargar_bytes(token: str, timeout: int = 90) -> bytes:
    url = f"{SP_MY_SITE}/_api/web/GetFileByServerRelativeUrl('{SP_MY_PATH}')/$value"
    resp = requests.get(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/octet-stream",
        },
        timeout=timeout,
        allow_redirects=True,
    )
    if resp.status_code != 200:
        raise FuenteError(f"SharePoint HTTP {resp.status_code} descargando Registros Acopio")
    return resp.content


HOJA_ACOPIO = "Registro_Acopio"
HOJA_PLANTA = "Registro_Planta"


def _leer_hoja(raw: bytes, hoja: str) -> pd.DataFrame:
    df = pd.read_excel(BytesIO(raw), sheet_name=hoja).dropna(how="all")
    df.columns = [str(c).strip() for c in df.columns]
    return df


def cargar(token: str) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Descarga el Excel y devuelve (df_acopio, df_planta, informe)."""
    raw = descargar_bytes(token)
    df_acopio = _leer_hoja(raw, HOJA_ACOPIO)
    df_planta = _leer_hoja(raw, HOJA_PLANTA)

    informe: dict = {
        "filas_acopio": len(df_acopio),
        "filas_planta": len(df_planta),
    }

    if "FECHA" in df_acopio.columns:
        df_acopio["FECHA"] = pd.to_datetime(df_acopio["FECHA"], errors="coerce")
        nulas = df_acopio["FECHA"].isna().sum()
        if nulas:
            informe["fechas_nulas_acopio"] = int(nulas)
        df_acopio = df_acopio.dropna(subset=["FECHA"])

    if "FECHA" in df_planta.columns:
        df_planta["FECHA"] = pd.to_datetime(df_planta["FECHA"], errors="coerce")

    informe["filas_acopio_limpias"] = len(df_acopio)
    return df_acopio, df_planta, informe
