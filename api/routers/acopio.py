"""Registros de Acopio: datos desde OneDrive (SharePoint personal de jcontreras)."""

from __future__ import annotations

import pandas as pd
from fastapi import APIRouter, Query
from fastapi.responses import Response

from api.deps import TTL_FUENTES, cached, get_token, invalidar
from core.fuentes.sharepoint_my import cargar

router = APIRouter(prefix="/api/acopio", tags=["acopio"])


def _cargar() -> dict:
    token = get_token("sharepoint_my")
    df_acopio, df_planta, informe = cargar(token)
    return {"df": df_acopio, "df_planta": df_planta, "informe": informe}


def _datos() -> dict:
    return cached("acopio:datos", TTL_FUENTES, _cargar)


@router.get("/filtros")
def filtros():
    from service import filtros as calc_filtros

    def calcular():
        d = _datos()
        return {**calc_filtros(d["df"]), "calidad_datos": d.get("informe", {})}

    return cached("acopio:filtros", TTL_FUENTES, calcular)


@router.get("/resumen")
def resumen(
    fundo: str | None = None,
    anio: int | None = None,
    semana: int | None = None,
):
    from service import filtrar, resumen as calc_resumen

    d = _datos()
    fundo = fundo or None
    anio = anio or None
    semana = semana or None
    return cached(
        f"acopio:resumen:{fundo or ''}:{anio or ''}:{semana or ''}",
        TTL_FUENTES,
        lambda: calc_resumen(filtrar(d["df"], anio, semana, fundo)),
    )


def _df_a_json(df: pd.DataFrame) -> str:
    """Convierte un DataFrame a JSON string, manejando NaN, time, datetime, etc."""
    df = df.copy()
    for col in df.columns:
        dtype = df[col].dtype
        if pd.api.types.is_datetime64_any_dtype(dtype):
            df[col] = df[col].dt.strftime("%Y-%m-%d")
        elif dtype == object:
            df[col] = df[col].apply(lambda v: str(v) if v is not None and not (isinstance(v, float) and pd.isna(v)) else None)
        elif pd.api.types.is_float_dtype(dtype):
            df[col] = df[col].where(df[col].notna(), None)
    return df.to_json(orient="records", force_ascii=False)


@router.get("/datos")
def datos(
    fundo: str | None = None,
    anio: int | None = None,
    semana: int | None = None,
    limite: int = Query(500, ge=1, le=5000),
):
    from service import filtrar

    d = _datos()
    fundo = fundo or None
    anio = anio or None
    semana = semana or None

    def calcular():
        return _df_a_json(filtrar(d["df"], anio, semana, fundo).head(limite))

    body = cached(
        f"acopio:datos3:{fundo or ''}:{anio or ''}:{semana or ''}:{limite}",
        TTL_FUENTES,
        calcular,
    )
    return Response(body, media_type="application/json")


@router.get("/cruce")
def cruce(
    fundo: str | None = None,
    modulo: str | None = None,
    anio: int | None = None,
    semana: int | None = None,
):
    """Cruce de guías acopio vs planta, agrupado por fecha y fundo."""
    from service import cruce_guias, filtrar, resumen_cruce_por_fecha, resumen_cruce_por_fundo

    d = _datos()
    fundo = fundo or None
    modulo = modulo or None
    anio = anio or None
    semana = semana or None

    def calcular():
        df_a = filtrar(d["df"], anio, semana, fundo, modulo)
        merged = cruce_guias(df_a, d["df_planta"])
        total = len(merged)
        en_planta = int(merged["_en_planta"].sum())
        return {
            "total_guias": total,
            "en_planta": en_planta,
            "sin_captura": total - en_planta,
            "pct_captura": round(en_planta / total * 100, 1) if total else 0,
            "por_fecha": resumen_cruce_por_fecha(merged),
            "por_fundo": resumen_cruce_por_fundo(merged),
        }

    return cached(
        f"acopio:cruce:{fundo or ''}:{modulo or ''}:{anio or ''}:{semana or ''}",
        TTL_FUENTES,
        calcular,
    )


@router.get("/boxplot")
def boxplot(
    fundo: str | None = None,
    modulo: str | None = None,
    anio: int | None = None,
    semana: int | None = None,
):
    """Box plots de tiempos c.A y A.R por fecha."""
    from service import boxplot_tiempos, filtrar

    d = _datos()
    fundo = fundo or None
    modulo = modulo or None
    anio = anio or None
    semana = semana or None

    def calcular():
        df_a = filtrar(d["df"], anio, semana, fundo, modulo)
        return boxplot_tiempos(df_a, d["df_planta"])

    return cached(
        f"acopio:boxplot3:{fundo or ''}:{modulo or ''}:{anio or ''}:{semana or ''}",
        TTL_FUENTES,
        calcular,
    )


@router.get("/boxplot-detalle")
def boxplot_detalle(fecha: str = Query(...)):
    """Guías individuales con tiempos c.A y A.R para una fecha."""
    from service import detalle_tiempos

    d = _datos()
    return detalle_tiempos(d["df"], d["df_planta"], fecha)


@router.get("/placas")
def placas(
    fundo: str | None = None,
    modulo: str | None = None,
    anio: int | None = None,
    semana: int | None = None,
):
    """Resumen por placa y fecha: jabas, jarras, viajes."""
    from service import filtrar, resumen_por_placa

    d = _datos()
    fundo = fundo or None
    modulo = modulo or None
    anio = anio or None
    semana = semana or None

    def calcular():
        df_a = filtrar(d["df"], anio, semana, fundo, modulo)
        return resumen_por_placa(df_a)

    return cached(
        f"acopio:placas:{fundo or ''}:{modulo or ''}:{anio or ''}:{semana or ''}",
        TTL_FUENTES,
        calcular,
    )


@router.get("/histograma")
def histograma(
    fundo: str | None = None,
    modulo: str | None = None,
    anio: int | None = None,
    semana: int | None = None,
    intervalo: int = Query(30, ge=10, le=120),
):
    from service import filtrar, histograma_tiempos

    d = _datos()
    fundo = fundo or None
    modulo = modulo or None
    anio = anio or None
    semana = semana or None

    def calcular():
        df_a = filtrar(d["df"], anio, semana, fundo, modulo)
        return histograma_tiempos(df_a, d["df_planta"], intervalo)

    return cached(
        f"acopio:histo:{fundo or ''}:{modulo or ''}:{anio or ''}:{semana or ''}:{intervalo}",
        TTL_FUENTES,
        calcular,
    )


@router.get("/planta")
def planta(limite: int = Query(500, ge=1, le=5000)):
    d = _datos()

    def calcular():
        return _df_a_json(d["df_planta"].head(limite))

    body = cached(f"acopio:planta3:{limite}", TTL_FUENTES, calcular)
    return Response(body, media_type="application/json")


@router.post("/recargar")
def recargar():
    invalidar("acopio:")
    return {"ok": True}
