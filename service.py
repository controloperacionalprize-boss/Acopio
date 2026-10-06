"""Lógica de negocio para Acopio: filtros, resúmenes, cruce de guías."""

from __future__ import annotations

import pandas as pd

COL_GUIA = "COD_GUIA INTERNA"


def filtros(df: pd.DataFrame) -> dict:
    out: dict = {}
    if "FECHA" in df.columns:
        out["anios"] = sorted(int(x) for x in df["FECHA"].dt.year.dropna().unique())
        out["semanas"] = sorted(int(x) for x in df["FECHA"].dt.isocalendar().week.dropna().unique())
    if "FUNDO" in df.columns:
        out["fundo"] = sorted(df["FUNDO"].dropna().astype(str).unique().tolist())
    if "MODULO" in df.columns:
        out["modulo"] = sorted(df["MODULO"].dropna().astype(str).unique().tolist())
    if "TURNO" in df.columns:
        out["turno"] = sorted(df["TURNO"].dropna().astype(str).unique().tolist())
    if "TIPO DE PRODUCTO" in df.columns:
        out["tipo_producto"] = sorted(df["TIPO DE PRODUCTO"].dropna().astype(str).unique().tolist())
    return out


def filtrar(
    df: pd.DataFrame,
    anio: int | None = None,
    semana: int | None = None,
    fundo: str | None = None,
    modulo: str | None = None,
) -> pd.DataFrame:
    if anio and "FECHA" in df.columns:
        df = df[df["FECHA"].dt.year == anio]
    if semana and "FECHA" in df.columns:
        iso_week = df["FECHA"].dt.isocalendar().week.astype(int)
        iso_week.index = df.index
        df = df[iso_week == int(semana)]
    if fundo and "FUNDO" in df.columns:
        df = df[df["FUNDO"].astype(str).str.upper() == fundo.upper()]
    if modulo and "MODULO" in df.columns:
        df = df[df["MODULO"].astype(str) == str(modulo)]
    return df


def resumen(df: pd.DataFrame) -> dict:
    out: dict = {"total_registros": len(df)}
    if "FECHA" in df.columns and len(df):
        out["fecha_min"] = str(df["FECHA"].min().date())
        out["fecha_max"] = str(df["FECHA"].max().date())
    if "FUNDO" in df.columns:
        out["fundos"] = int(df["FUNDO"].nunique())
    if "JABAS TOTALES" in df.columns:
        out["jabas_totales"] = int(df["JABAS TOTALES"].sum())
    if "JARRAS TOTALES" in df.columns:
        out["jarras_totales"] = int(df["JARRAS TOTALES"].sum())
    return out


def cruce_guias(df_acopio: pd.DataFrame, df_planta: pd.DataFrame) -> pd.DataFrame:
    """LEFT JOIN de acopio con planta por COD_GUIA INTERNA.
    Agrega columna '_en_planta' (bool): True si la guía fue capturada en planta."""
    if COL_GUIA not in df_acopio.columns or COL_GUIA not in df_planta.columns:
        df_acopio = df_acopio.copy()
        df_acopio["_en_planta"] = False
        return df_acopio

    guias_planta = set(df_planta[COL_GUIA].dropna().astype(str).unique())
    merged = df_acopio.copy()
    merged["_en_planta"] = merged[COL_GUIA].astype(str).isin(guias_planta)
    return merged


def resumen_cruce_por_fecha(cruce: pd.DataFrame) -> list[dict]:
    """Agrupa por fecha: total guías, capturadas en planta, no capturadas."""
    if "FECHA" not in cruce.columns or len(cruce) == 0:
        return []

    cruce = cruce.copy()
    cruce["fecha_str"] = cruce["FECHA"].dt.strftime("%Y-%m-%d")

    grupo = cruce.groupby("fecha_str").agg(
        total=("_en_planta", "size"),
        en_planta=("_en_planta", "sum"),
    ).reset_index()
    grupo["sin_captura"] = grupo["total"] - grupo["en_planta"]
    grupo["pct_captura"] = (grupo["en_planta"] / grupo["total"] * 100).round(1)

    return grupo.sort_values("fecha_str").to_dict(orient="records")


def resumen_cruce_por_fundo(cruce: pd.DataFrame) -> list[dict]:
    """Agrupa por fundo: total guías, capturadas en planta, no capturadas."""
    if "FUNDO" not in cruce.columns or len(cruce) == 0:
        return []

    grupo = cruce.groupby("FUNDO").agg(
        total=("_en_planta", "size"),
        en_planta=("_en_planta", "sum"),
    ).reset_index()
    grupo["sin_captura"] = grupo["total"] - grupo["en_planta"]
    grupo["pct_captura"] = (grupo["en_planta"] / grupo["total"] * 100).round(1)

    return grupo.sort_values("FUNDO").to_dict(orient="records")


def _to_minutes(td: pd.Series) -> pd.Series:
    """Convierte timedelta a minutos float, descartando negativos."""
    if hasattr(td.dt, "total_seconds"):
        mins = td.dt.total_seconds() / 60
    else:
        mins = td.apply(lambda v: v.total_seconds() / 60 if hasattr(v, "total_seconds") else float("nan"))
    return mins.where(mins >= 0)


def _boxplot_stats(series: pd.Series) -> dict | None:
    s = series.dropna()
    if len(s) < 2:
        return None
    q1 = float(s.quantile(0.25))
    med = float(s.median())
    q3 = float(s.quantile(0.75))
    iqr = q3 - q1
    whisker_lo = float(s[s >= q1 - 1.5 * iqr].min())
    whisker_hi = float(s[s <= q3 + 1.5 * iqr].max())
    return {"min": round(whisker_lo, 1), "q1": round(q1, 1), "med": round(med, 1),
            "q3": round(q3, 1), "max": round(whisker_hi, 1), "n": len(s)}


def _parse_hora(col: pd.Series) -> pd.Series:
    """Convierte columna de horas (puede ser time, string, datetime, timedelta) a timedelta."""
    import datetime as dt

    def to_td(v):
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return pd.NaT
        if isinstance(v, dt.timedelta):
            return v
        if isinstance(v, dt.time):
            return dt.timedelta(hours=v.hour, minutes=v.minute, seconds=v.second)
        if isinstance(v, dt.datetime):
            return dt.timedelta(hours=v.hour, minutes=v.minute, seconds=v.second)
        if isinstance(v, str):
            try:
                parts = v.strip().split(":")
                return dt.timedelta(hours=int(parts[0]), minutes=int(parts[1]),
                                    seconds=int(parts[2]) if len(parts) > 2 else 0)
            except (ValueError, IndexError):
                return pd.NaT
        if isinstance(v, (int, float)):
            seg = int(round(float(v) * 86400)) % 86400
            return dt.timedelta(seconds=seg)
        return pd.NaT

    return col.apply(to_td)


def boxplot_tiempos(df_acopio: pd.DataFrame, df_planta: pd.DataFrame) -> list[dict]:
    """Box plots de tiempos:
    C-A = HORA RECEPCION (col AE) − HORA DE ENVIO (col G)
    A-R = HORA RECEPCION PLANTA (col F, Registro_Planta) − HORA_ENVIO (col AH)
    Agrupados por fecha."""
    if "FECHA" not in df_acopio.columns:
        return []

    df = df_acopio.copy()
    df["fecha_str"] = df["FECHA"].dt.strftime("%Y-%m-%d")

    # C-A: HORA RECEPCION (AE) − HORA DE ENVIO (G)
    tiene_ca = "HORA DE ENVIO" in df.columns and "HORA RECEPCION" in df.columns
    if tiene_ca:
        df["_h_envio_campo"] = _parse_hora(df["HORA DE ENVIO"])
        df["_h_recep_acopio"] = _parse_hora(df["HORA RECEPCION"])
        df["_ca_min"] = _to_minutes(df["_h_recep_acopio"] - df["_h_envio_campo"])

    # A-R: HORA RECEPCION PLANTA (col F, Registro_Planta) − HORA_ENVIO (AH)
    tiene_ar = (COL_GUIA in df.columns and COL_GUIA in df_planta.columns
                and "HORA_ENVIO" in df.columns
                and "HORA RECEPCION PLANTA" in df_planta.columns)
    if tiene_ar:
        planta = df_planta[[COL_GUIA, "HORA RECEPCION PLANTA"]].drop_duplicates(subset=[COL_GUIA])
        planta[COL_GUIA] = planta[COL_GUIA].astype(str)
        df[COL_GUIA] = df[COL_GUIA].astype(str)
        df = df.merge(planta, on=COL_GUIA, how="left")
        df["_h_envio_acopio"] = _parse_hora(df["HORA_ENVIO"])
        df["_h_recep_planta"] = _parse_hora(df["HORA RECEPCION PLANTA"])
        df["_ar_min"] = _to_minutes(df["_h_recep_planta"] - df["_h_envio_acopio"])

    resultado = []
    for fecha in sorted(df["fecha_str"].unique()):
        sub = df[df["fecha_str"] == fecha]
        entry: dict = {"fecha": fecha}
        if tiene_ca:
            entry["ca"] = _boxplot_stats(sub["_ca_min"])
        if tiene_ar:
            entry["ar"] = _boxplot_stats(sub["_ar_min"])
        resultado.append(entry)

    return resultado


def detalle_tiempos(df_acopio: pd.DataFrame, df_planta: pd.DataFrame, fecha: str) -> list[dict]:
    """Devuelve las guías individuales de una fecha con sus tiempos c.A y A.R."""
    if "FECHA" not in df_acopio.columns:
        return []

    df = df_acopio.copy()
    df["fecha_str"] = df["FECHA"].dt.strftime("%Y-%m-%d")
    df = df[df["fecha_str"] == fecha]
    if df.empty:
        return []

    tiene_ca = "HORA DE ENVIO" in df.columns and "HORA RECEPCION" in df.columns
    if tiene_ca:
        df["_h_envio_campo"] = _parse_hora(df["HORA DE ENVIO"])
        df["_h_recep_acopio"] = _parse_hora(df["HORA RECEPCION"])
        df["_ca_min"] = _to_minutes(df["_h_recep_acopio"] - df["_h_envio_campo"])

    tiene_ar = (COL_GUIA in df.columns and COL_GUIA in df_planta.columns
                and "HORA_ENVIO" in df.columns
                and "HORA RECEPCION PLANTA" in df_planta.columns)
    if tiene_ar:
        planta = df_planta[[COL_GUIA, "HORA RECEPCION PLANTA"]].drop_duplicates(subset=[COL_GUIA])
        planta[COL_GUIA] = planta[COL_GUIA].astype(str)
        df[COL_GUIA] = df[COL_GUIA].astype(str)
        df = df.merge(planta, on=COL_GUIA, how="left")
        df["_h_envio_acopio"] = _parse_hora(df["HORA_ENVIO"])
        df["_h_recep_planta"] = _parse_hora(df["HORA RECEPCION PLANTA"])
        df["_ar_min"] = _to_minutes(df["_h_recep_planta"] - df["_h_envio_acopio"])

    cols = [COL_GUIA, "FUNDO", "TURNO"]
    for c in ["HORA DE ENVIO", "HORA RECEPCION", "HORA_ENVIO", "HORA RECEPCION PLANTA"]:
        if c in df.columns:
            cols.append(c)

    out = []
    for _, r in df.iterrows():
        row: dict = {}
        row["guia"] = str(r.get(COL_GUIA, ""))
        row["fundo"] = str(r.get("FUNDO", ""))
        row["turno"] = str(r.get("TURNO", ""))
        if "HORA DE ENVIO" in df.columns:
            row["hora_envio_campo"] = str(r.get("HORA DE ENVIO", ""))
        if "HORA RECEPCION" in df.columns:
            row["hora_recep_acopio"] = str(r.get("HORA RECEPCION", ""))
        if "HORA_ENVIO" in df.columns:
            row["hora_envio_acopio"] = str(r.get("HORA_ENVIO", ""))
        if "HORA RECEPCION PLANTA" in df.columns:
            row["hora_recep_planta"] = str(r.get("HORA RECEPCION PLANTA", ""))
        if tiene_ca and pd.notna(r.get("_ca_min")):
            row["ca_min"] = round(float(r["_ca_min"]), 1)
        if tiene_ar and pd.notna(r.get("_ar_min")):
            row["ar_min"] = round(float(r["_ar_min"]), 1)
        out.append(row)

    return out


def histograma_tiempos(df_acopio: pd.DataFrame, df_planta: pd.DataFrame, intervalo: int = 30) -> dict:
    """Histograma de tiempos c.A y A.R con intervalo configurable, incluyendo placas por bin."""
    if "FECHA" not in df_acopio.columns:
        return {"bins": {}, "resumen": {}}

    df = df_acopio.copy()
    tiene_placa = "PLACA" in df.columns

    tiene_ca = "HORA DE ENVIO" in df.columns and "HORA RECEPCION" in df.columns
    if tiene_ca:
        df["_h_envio_campo"] = _parse_hora(df["HORA DE ENVIO"])
        df["_h_recep_acopio"] = _parse_hora(df["HORA RECEPCION"])
        df["_ca_min"] = _to_minutes(df["_h_recep_acopio"] - df["_h_envio_campo"])

    tiene_ar = (COL_GUIA in df.columns and COL_GUIA in df_planta.columns
                and "HORA_ENVIO" in df.columns
                and "HORA RECEPCION PLANTA" in df_planta.columns)
    if tiene_ar:
        planta = df_planta[[COL_GUIA, "HORA RECEPCION PLANTA"]].drop_duplicates(subset=[COL_GUIA])
        planta[COL_GUIA] = planta[COL_GUIA].astype(str)
        df[COL_GUIA] = df[COL_GUIA].astype(str)
        df = df.merge(planta, on=COL_GUIA, how="left")
        df["_h_envio_acopio"] = _parse_hora(df["HORA_ENVIO"])
        df["_h_recep_planta"] = _parse_hora(df["HORA RECEPCION PLANTA"])
        df["_ar_min"] = _to_minutes(df["_h_recep_planta"] - df["_h_envio_acopio"])

    max_edge = intervalo * 8
    edges = list(range(0, max_edge + 1, intervalo)) + [float("inf")]
    labels = [f"{edges[i]}-{edges[i+1]}" if edges[i+1] != float("inf") else f">{edges[i]}" for i in range(len(edges) - 1)]

    def _bin(col_name: str) -> list[dict]:
        s = df[col_name].dropna()
        total = len(s)
        if total == 0:
            return [{"rango": l, "count": 0, "pct": 0, "pct_acum": 0, "placas": []} for l in labels]

        cat = pd.cut(s, bins=edges, labels=labels, right=False)
        counts = cat.value_counts().reindex(labels, fill_value=0)

        placas_por_bin: dict[str, list[dict]] = {l: [] for l in labels}
        if tiene_placa:
            df["_bin"] = cat
            for label in labels:
                sub = df[df["_bin"] == label]
                if sub.empty:
                    continue
                pg = sub.groupby(sub["PLACA"].astype(str).str.strip().str.upper()).agg(
                    viajes=(col_name, "size"),
                    media=(col_name, "mean"),
                ).reset_index().sort_values("viajes", ascending=False).head(20)
                pg["media"] = pg["media"].round(1)
                placas_por_bin[label] = pg.to_dict(orient="records")

        acum = 0
        rows = []
        for l in labels:
            c = int(counts[l])
            acum += c
            rows.append({"rango": l, "count": c,
                          "pct": round(c / total * 100, 1),
                          "pct_acum": round(acum / total * 100, 1),
                          "placas": placas_por_bin[l]})
        return rows

    result: dict = {"ca": [], "ar": []}
    resumen: dict = {}
    if tiene_ca:
        ca = df["_ca_min"].dropna()
        result["ca"] = _bin("_ca_min")
        resumen["ca_media"] = round(float(ca.mean()), 1) if len(ca) else 0
        resumen["ca_mediana"] = round(float(ca.median()), 1) if len(ca) else 0
        resumen["ca_total"] = int(len(ca))
    if tiene_ar:
        ar = df["_ar_min"].dropna()
        result["ar"] = _bin("_ar_min")
        resumen["ar_media"] = round(float(ar.mean()), 1) if len(ar) else 0
        resumen["ar_mediana"] = round(float(ar.median()), 1) if len(ar) else 0
        resumen["ar_total"] = int(len(ar))

    return {"bins": result, "resumen": resumen}


def resumen_por_placa(df: pd.DataFrame) -> dict:
    """Agrupa por PLACA y FECHA: jarras, jabas, tipo de producto, viajes."""
    cols_req = {"PLACA", "FECHA", "JABAS TOTALES", "JARRAS TOTALES"}
    if not cols_req.issubset(set(df.columns)) or df.empty:
        return {"por_placa_fecha": [], "por_placa": []}

    df = df.copy()
    df["fecha_str"] = df["FECHA"].dt.strftime("%Y-%m-%d")
    df["PLACA"] = df["PLACA"].astype(str).str.strip().str.upper()
    df = df[df["PLACA"].ne("") & df["PLACA"].ne("NAN") & df["PLACA"].ne("NONE")]

    tiene_tipo = "TIPO DE PRODUCTO" in df.columns

    # Por placa y fecha
    agg = {"JABAS TOTALES": "sum", "JARRAS TOTALES": "sum", "PLACA": "size"}
    if tiene_tipo:
        agg["TIPO DE PRODUCTO"] = lambda x: ", ".join(sorted(x.dropna().astype(str).unique()))
    g = df.groupby(["PLACA", "fecha_str"]).agg(**{
        "jabas": ("JABAS TOTALES", "sum"),
        "jarras": ("JARRAS TOTALES", "sum"),
        "viajes": ("PLACA", "size"),
        **({"tipos": ("TIPO DE PRODUCTO", lambda x: ", ".join(sorted(x.dropna().astype(str).unique())))} if tiene_tipo else {}),
    }).reset_index()
    g = g.rename(columns={"fecha_str": "fecha"})

    # Totales por placa
    t = df.groupby("PLACA").agg(
        jabas=("JABAS TOTALES", "sum"),
        jarras=("JARRAS TOTALES", "sum"),
        viajes=("PLACA", "size"),
        fechas=("fecha_str", "nunique"),
    ).reset_index().sort_values("viajes", ascending=False)

    return {
        "por_placa_fecha": g.to_dict(orient="records"),
        "por_placa": t.to_dict(orient="records"),
    }
