import { ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar, BarChart, Brush, CartesianGrid, Cell, ComposedChart, Legend, Line,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { conQuery, getJson, postJson } from "../../api";
import { useDatos } from "../../hooks";

/* ── Tipos ── */
type FiltrosResp = {
  anios?: number[];
  semanas?: number[];
  fundo?: string[];
  modulo?: string[];
};

type FilaCruce = { fecha_str: string; total: number; en_planta: number; sin_captura: number; pct_captura: number };
type FilaFundo = { FUNDO: string; total: number; en_planta: number; sin_captura: number; pct_captura: number };
type CruceResp = { total_guias: number; en_planta: number; sin_captura: number; pct_captura: number; por_fecha: FilaCruce[]; por_fundo: FilaFundo[] };
type BoxStat = { min: number; q1: number; med: number; q3: number; max: number; n: number } | null;
type BoxEntry = { fecha: string; ca?: BoxStat; ar?: BoxStat };
type PlacaFecha = { PLACA: string; fecha: string; jabas: number; jarras: number; viajes: number; tipos?: string };
type PlacaTotal = { PLACA: string; jabas: number; jarras: number; viajes: number; fechas: number };
type PlacasResp = { por_placa_fecha: PlacaFecha[]; por_placa: PlacaTotal[] };
type DetalleRow = { guia: string; fundo: string; turno: string; hora_envio_campo?: string; hora_recep_acopio?: string; hora_envio_acopio?: string; hora_recep_planta?: string; ca_min?: number; ar_min?: number };
type HistoPlaca = { PLACA: string; viajes: number; media: number };
type HistoBin = { rango: string; count: number; pct: number; pct_acum: number; placas: HistoPlaca[] };
type HistoResp = { bins: { ca?: HistoBin[]; ar?: HistoBin[] }; resumen: Record<string, number> };

/* ── Colores ── */
const C = {
  verde: "#22c55e", rojo: "#ef4444", azul: "#4361ee", ambar: "#f59e0b",
  verdeSuave: "#bbf7d0", rojoSuave: "#fecaca",
};

/* ── Página principal ── */
export default function Acopio() {
  const [anio, setAnio] = useState("");
  const [semana, setSemana] = useState("");
  const [fundo, setFundo] = useState("");
  const [modulo, setModulo] = useState("");

  const { datos: filtros, authDest } = useDatos<FiltrosResp>("/api/acopio/filtros");
  const anioActivo = anio || String(filtros?.anios?.at(-1) ?? "");

  const periodo = {
    ...(fundo ? { fundo } : {}),
    ...(modulo ? { modulo } : {}),
    ...(anioActivo ? { anio: anioActivo } : {}),
    ...(semana ? { semana } : {}),
  };

  const { datos: cruce, cargando: c1 } = useDatos<CruceResp>(filtros ? conQuery("/api/acopio/cruce", periodo) : null);
  const { datos: boxRaw, cargando: c2 } = useDatos<BoxEntry[]>(filtros ? conQuery("/api/acopio/boxplot", periodo) : null);
  const { datos: placasData, cargando: c3 } = useDatos<PlacasResp>(filtros ? conQuery("/api/acopio/placas", periodo) : null);
  const [histoIntervalo, setHistoIntervalo] = useState(30);
  const { datos: histoData } = useDatos<HistoResp>(filtros ? conQuery("/api/acopio/histograma", { ...periodo, intervalo: histoIntervalo }) : null);
  const cargando = c1 || c2 || c3;

  const [fechaSel, setFechaSel] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<DetalleRow[] | null>(null);
  const [cargandoDet, setCargandoDet] = useState(false);

  const seleccionarFecha = useCallback((fecha: string) => {
    const fechaFull = fecha.length <= 5 ? boxRaw?.find((d) => d.fecha.slice(5) === fecha)?.fecha : fecha;
    if (!fechaFull) return;
    if (fechaSel === fechaFull) { setFechaSel(null); setDetalle(null); return; }
    setFechaSel(fechaFull);
    setCargandoDet(true);
    getJson<DetalleRow[]>(conQuery("/api/acopio/boxplot-detalle", { fecha: fechaFull }))
      .then(setDetalle)
      .catch(() => setDetalle(null))
      .finally(() => setCargandoDet(false));
  }, [boxRaw, fechaSel]);

  const recargar = async () => { await postJson("/api/acopio/recargar", {}); location.reload(); };

  if (authDest) return <p style={{ padding: "2rem", textAlign: "center" }}>Esperando autenticación de Microsoft…</p>;

  return (
    <div className="pagina">
      <header className="cab">
        <div>
          <div className="miga">Producción <ChevronRight size={13} /> Acopio</div>
          <h1>Cruce de Guías · Acopio vs Planta</h1>
        </div>
        <button className="btn-icono" onClick={recargar} title="Recargar datos"><RefreshCw size={16} /></button>
      </header>

      <div className="barra-filtros">
        {filtros?.fundo && <Sel label="Fundo" value={fundo} onChange={setFundo} opts={filtros.fundo} todos />}
        {filtros?.modulo && <Sel label="Módulo" value={modulo} onChange={setModulo} opts={filtros.modulo} todos />}
        {filtros?.anios && <Sel label="Año" value={anioActivo} onChange={(v) => { setAnio(v); setSemana(""); }} opts={[...filtros.anios].reverse()} />}
        {filtros?.semanas && <Sel label="Semana" value={semana} onChange={setSemana} opts={filtros.semanas} todos />}
      </div>

      {cargando && <p style={{ padding: "1rem" }}>Cargando datos…</p>}
      {cruce && <Tarjetas cruce={cruce} />}

      {histoData && (
        <Seccion titulo="Histograma de Tiempos">
          <HistogramaChart datos={histoData} intervalo={histoIntervalo} onIntervaloChange={setHistoIntervalo} />
        </Seccion>
      )}

      {boxRaw && (
        <Seccion titulo="Tiempos (minutos) — Diagrama de Cajas">
          <BoxPlotSection datos={boxRaw} onClickFecha={seleccionarFecha} />
          {fechaSel && (
            <div style={{ margin: "0 0 1rem" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                Detalle de guías — {fechaSel}
                <button onClick={() => { setFechaSel(null); setDetalle(null); }} style={{ marginLeft: 12, fontSize: "0.75rem", cursor: "pointer", background: "none", border: "1px solid var(--borde)", borderRadius: 6, padding: "2px 8px", color: "var(--texto-tenue)" }}>✕ Cerrar</button>
              </h3>
              {cargandoDet && <p style={{ fontSize: "0.85rem" }}>Cargando…</p>}
              {detalle && <TablaDetalle filas={detalle} />}
            </div>
          )}
          {placasData && placasData.por_placa.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                Jabas y Jarras por Placa{fechaSel ? ` — ${fechaSel}` : ""}
              </h3>
              <PlacasChart datos={placasData} fechaSel={fechaSel} />
            </div>
          )}
        </Seccion>
      )}

      {cruce && cruce.por_fecha.length > 0 && (
        <Seccion titulo="Guías por Fecha">
          <CruceBarras datos={cruce.por_fecha} onClickFecha={(f) => { setFechaSel(f); setDetalle(null); }} fechaSel={fechaSel} />
        </Seccion>
      )}

      {cruce && cruce.por_fundo.length > 1 && (
        <Seccion titulo="Guías por Fundo">
          <CruceFundos datos={cruce.por_fundo} />
        </Seccion>
      )}
    </div>
  );
}

/* ── Sección colapsable ── */
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(true);
  return (
    <div style={{ margin: "1rem 0", border: "1px solid var(--borde)", borderRadius: 10, overflow: "hidden" }}>
      <button onClick={() => setAbierto(!abierto)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "0.65rem 1rem",
        background: "var(--fondo)", border: "none", cursor: "pointer", fontSize: "0.95rem", fontWeight: 600,
        color: "var(--texto)", textAlign: "left",
      }}>
        <span style={{ transition: "transform 0.2s", transform: abierto ? "rotate(90deg)" : "rotate(0deg)", fontSize: "0.8rem" }}>&#9654;</span>
        {titulo}
      </button>
      {abierto && <div style={{ padding: "0 1rem 1rem" }}>{children}</div>}
    </div>
  );
}

/* ── Selector ── */
function Sel({ label, value, onChange, opts, todos }: {
  label: string; value: string; onChange: (v: string) => void; opts: (string | number)[]; todos?: boolean;
}) {
  return (
    <div className="selector">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {todos && <option value="">{label === "Semana" ? "Todas" : "Todos"}</option>}
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

/* ── Tarjetas ── */
function Tarjetas({ cruce }: { cruce: CruceResp }) {
  const items = [
    { label: "Total guías", value: cruce.total_guias, color: C.azul },
    { label: "En planta", value: cruce.en_planta, color: C.verde },
    { label: "Sin captura", value: cruce.sin_captura, color: C.rojo },
    { label: "% Captura", value: `${cruce.pct_captura}%`, color: cruce.pct_captura >= 90 ? C.verde : cruce.pct_captura >= 70 ? C.ambar : C.rojo },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", margin: "1rem 0" }}>
      {items.map((t) => (
        <div key={t.label} style={{ background: "var(--fondo)", border: "1px solid var(--borde)", borderRadius: 10, padding: "0.75rem 1rem", borderLeft: `4px solid ${t.color}` }}>
          <div style={{ fontSize: "0.7rem", color: "var(--texto-tenue)", textTransform: "uppercase", letterSpacing: 0.5 }}>{t.label}</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 2 }}>{t.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Histograma de tiempos ── */
function HistogramaChart({ datos, intervalo, onIntervaloChange }: { datos: HistoResp; intervalo: number; onIntervaloChange: (v: number) => void }) {
  const [tipo, setTipo] = useState<"ca" | "ar">("ca");
  const [rangoSel, setRangoSel] = useState<string | null>(null);
  const bins = datos.bins[tipo] ?? [];
  const res = datos.resumen;
  const total = tipo === "ca" ? (res.ca_total ?? 0) : (res.ar_total ?? 0);
  const media = tipo === "ca" ? (res.ca_media ?? 0) : (res.ar_media ?? 0);
  const mediana = tipo === "ca" ? (res.ca_mediana ?? 0) : (res.ar_mediana ?? 0);

  const binSel = rangoSel ? bins.find((b) => b.rango === rangoSel) : null;

  if (!bins.length) return null;

  const rangoLabel = (r: string) => {
    if (r.startsWith(">")) return `>${fmtMin(Number(r.slice(1)))}`;
    const [a, b2] = r.split("-").map(Number);
    return `${fmtMin(a)}-${fmtMin(b2)}`;
  };
  function fmtMin(m: number) { return m < 60 ? `${m}min` : m % 60 === 0 ? `${m / 60}h` : `${(m / 60).toFixed(1)}h`; }

  const colorBarra = (b: HistoBin) => {
    const umbral = tipo === "ca" ? 90 : 60;
    const inicio = b.rango.startsWith(">") ? Number(b.rango.slice(1)) : Number(b.rango.split("-")[0]);
    return inicio >= umbral ? C.rojo : tipo === "ca" ? C.azul : C.ambar;
  };

  const intervalos = [
    { v: 15, l: "15 min" }, { v: 30, l: "30 min" }, { v: 60, l: "1 hora" },
  ];

  return (
    <div>
      {/* Controles */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--borde)" }}>
          <button onClick={() => { setTipo("ca"); setRangoSel(null); }}
            style={{ padding: "6px 14px", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", border: "none",
              background: tipo === "ca" ? C.azul : "transparent", color: tipo === "ca" ? "#fff" : "var(--texto)" }}>
            c.A
          </button>
          <button onClick={() => { setTipo("ar"); setRangoSel(null); }}
            style={{ padding: "6px 14px", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", border: "none",
              background: tipo === "ar" ? C.ambar : "transparent", color: tipo === "ar" ? "#fff" : "var(--texto)" }}>
            A.R
          </button>
        </div>
        <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--borde)" }}>
          {intervalos.map((it) => (
            <button key={it.v} onClick={() => { onIntervaloChange(it.v); setRangoSel(null); }}
              style={{ padding: "5px 10px", fontSize: "0.75rem", cursor: "pointer", border: "none",
                background: intervalo === it.v ? "#6366f1" : "transparent", color: intervalo === it.v ? "#fff" : "var(--texto)" }}>
              {it.l}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: "0.8rem" }}>
          <span><strong>{total}</strong> viajes</span>
          <span>Media: <strong>{media} min</strong></span>
          <span>Mediana: <strong>{mediana} min</strong></span>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={bins} margin={{ top: 10, right: 40, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
          <XAxis dataKey="rango" tick={{ fontSize: 10 }} tickFormatter={rangoLabel} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: "N° Viajes", angle: -90, position: "insideLeft", fontSize: 10 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`} />
          <Tooltip contentStyle={{ borderRadius: 8, fontSize: "0.8rem" }}
            formatter={(v: number, name: string) => [
              name === "pct_acum" ? `${v}%` : v,
              name === "count" ? "N° Viajes" : "% Acumulado",
            ]}
            labelFormatter={rangoLabel} />
          <Bar dataKey="count" yAxisId="left" barSize={50} radius={[4, 4, 0, 0]}
            onClick={(d: any) => setRangoSel(d?.rango === rangoSel ? null : d?.rango)} style={{ cursor: "pointer" }}>
            {bins.map((b, i) => (
              <Cell key={i} fill={colorBarra(b)} fillOpacity={b.rango === rangoSel ? 1 : 0.75}
                stroke={b.rango === rangoSel ? "#000" : "none"} strokeWidth={b.rango === rangoSel ? 2 : 0} />
            ))}
          </Bar>
          <Line type="monotone" dataKey="pct_acum" yAxisId="right" stroke="#6366f1" strokeWidth={2.5}
            dot={{ r: 4, fill: "#6366f1" }} />
          <Legend formatter={(v) => v === "count" ? "N° Viajes" : v === "pct_acum" ? "% Acumulado" : v} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Detalle de placas al seleccionar barra */}
      {binSel && binSel.placas.length > 0 && (
        <div style={{ marginTop: "0.75rem", padding: "0.75rem", border: `1.5px solid ${colorBarra(binSel)}33`, borderRadius: 10, background: `${colorBarra(binSel)}08` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <h4 style={{ fontSize: "0.85rem", fontWeight: 600, margin: 0 }}>
              Placas en rango {rangoLabel(binSel.rango)} — {binSel.count} viajes
            </h4>
            <button onClick={() => setRangoSel(null)} style={{ fontSize: "0.75rem", cursor: "pointer", background: "none", border: "1px solid var(--borde)", borderRadius: 6, padding: "2px 8px", color: "var(--texto-tenue)" }}>✕</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {binSel.placas.map((p) => (
              <div key={p.PLACA} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--borde)", background: "var(--fondo)", minWidth: 140 }}>
                <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>{p.PLACA}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--texto-tenue)", display: "flex", gap: 10, marginTop: 2 }}>
                  <span>{p.viajes} viajes</span>
                  <span>~{p.media} min</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla resumen */}
      <div style={{ maxHeight: 200, overflow: "auto", border: "1px solid var(--borde)", borderRadius: 8, marginTop: "0.75rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Rango", "Viajes", "% Total", "% Acumulado"].map((h) => (
                <th key={h} style={{ padding: "6px 10px", fontSize: "0.75rem", textAlign: "center", borderBottom: "2px solid var(--borde)", position: "sticky", top: 0, background: "var(--fondo)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bins.map((b, i) => (
              <tr key={b.rango} onClick={() => setRangoSel(b.rango === rangoSel ? null : b.rango)}
                style={{ cursor: "pointer", background: b.rango === rangoSel ? `${colorBarra(b)}15` : i % 2 ? "transparent" : "var(--fondo-alt, rgba(0,0,0,0.02))" }}>
                <td style={{ padding: "5px 10px", fontSize: "0.8rem", textAlign: "center", fontWeight: 600 }}>{rangoLabel(b.rango)}</td>
                <td style={{ padding: "5px 10px", fontSize: "0.8rem", textAlign: "center", color: colorBarra(b), fontWeight: 600 }}>{b.count}</td>
                <td style={{ padding: "5px 10px", fontSize: "0.8rem", textAlign: "center" }}>{b.pct}%</td>
                <td style={{ padding: "5px 10px", fontSize: "0.8rem", textAlign: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                    <div style={{ width: 60, height: 6, borderRadius: 3, background: "var(--borde)", overflow: "hidden" }}>
                      <div style={{ width: `${b.pct_acum}%`, height: "100%", background: "#6366f1", borderRadius: 3 }} />
                    </div>
                    <span>{b.pct_acum}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Box Plot real con SVG custom ── */
function BoxPlotSection({ datos, onClickFecha }: { datos: BoxEntry[]; onClickFecha?: (fecha: string) => void }) {
  const flat = useMemo(() => {
    return datos.filter((d) => d.ca || d.ar).map((d) => ({
      fecha: d.fecha.slice(5), fechaFull: d.fecha,
      ca_min: d.ca?.min ?? null, ca_q1: d.ca?.q1 ?? null, ca_med: d.ca?.med ?? null,
      ca_q3: d.ca?.q3 ?? null, ca_max: d.ca?.max ?? null, ca_n: d.ca?.n ?? 0,
      ar_min: d.ar?.min ?? null, ar_q1: d.ar?.q1 ?? null, ar_med: d.ar?.med ?? null,
      ar_q3: d.ar?.q3 ?? null, ar_max: d.ar?.max ?? null, ar_n: d.ar?.n ?? 0,
    }));
  }, [datos]);

  if (!flat.length) return null;

  const allQ3 = flat.map((d) => Math.max(d.ca_q3 ?? 0, d.ar_q3 ?? 0)).filter((v) => v > 0).sort((a, b) => a - b);
  const p90q3 = allQ3[Math.floor(allQ3.length * 0.9)] ?? 60;
  const yMax = Math.ceil(Math.max(p90q3 * 2, 60));

  const dataWithDummy = flat.map((d) => ({ ...d, _dummy: yMax }));
  const dayW = 48;
  const chartW = Math.max(dataWithDummy.length * dayW + 80, 600);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [dataWithDummy.length]);

  return (
    <div style={{ margin: "1.5rem 0" }}>
      <div style={{ display: "flex", gap: "1rem", fontSize: "0.75rem", marginBottom: 4 }}>
        <span><span style={{ display: "inline-block", width: 12, height: 12, background: C.azul, opacity: 0.35, border: `1.5px solid ${C.azul}`, borderRadius: 2, verticalAlign: "middle", marginRight: 4 }} />c.A (Campo→Acopio)</span>
        <span><span style={{ display: "inline-block", width: 12, height: 12, background: C.ambar, opacity: 0.35, border: `1.5px solid ${C.ambar}`, borderRadius: 2, verticalAlign: "middle", marginRight: 4 }} />A.R (Acopio→Planta)</span>
      </div>
      <div ref={scrollRef} style={{ overflowX: "auto", overflowY: "hidden", WebkitOverflowScrolling: "touch", paddingBottom: 8 }}>
        <ComposedChart width={chartW} height={360} data={dataWithDummy} margin={{ top: 10, right: 30, bottom: 30, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="fecha" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11 }} domain={[0, yMax]} label={{ value: "min", angle: -90, position: "insideLeft", fontSize: 11 }}
            allowDataOverflow />
          {[60, 120, 180].filter((h) => h < yMax).map((h) => (
            <ReferenceLine key={h} y={h} stroke="var(--texto-tenue)" strokeDasharray="6 3" strokeOpacity={0.5}
              label={{ value: `${h / 60}h`, position: "right", fontSize: 10, fill: "var(--texto-tenue)" }} />
          ))}
          <Tooltip content={<BoxTooltip />} />
          <Bar dataKey="_dummy" barSize={40} fill="transparent"
            shape={(props: any) => <BoxShape {...props} onClickFecha={onClickFecha} />} />
        </ComposedChart>
      </div>
    </div>
  );
}

function BoxShape(props: any) {
  const { x, y, width, height, payload, onClickFecha } = props;
  if (!height || height <= 0) return null;
  const yMax2 = payload._dummy;
  const toY = (v: number) => y + height - (v / yMax2) * height;
  const bw = width * 0.4;
  const els: React.ReactElement[] = [];

  const drawBox = (prefix: "ca" | "ar", color: string, offsetX: number) => {
    const mn = payload[`${prefix}_min`], q1 = payload[`${prefix}_q1`],
      med = payload[`${prefix}_med`], q3 = payload[`${prefix}_q3`],
      mx = payload[`${prefix}_max`];
    if (med == null) return;
    const cx = x + width / 2 + offsetX;
    const yMn = toY(mn), yQ1 = toY(q1), yMed = toY(med), yQ3 = toY(q3), yMx = toY(mx);
    const capW = bw * 0.6;
    els.push(
      <g key={prefix}>
        {/* whisker inferior */}
        <line x1={cx} x2={cx} y1={yQ1} y2={yMn} stroke={color} strokeWidth={1.5} />
        <line x1={cx - capW / 2} x2={cx + capW / 2} y1={yMn} y2={yMn} stroke={color} strokeWidth={1.5} />
        {/* whisker superior */}
        <line x1={cx} x2={cx} y1={yQ3} y2={yMx} stroke={color} strokeWidth={1.5} />
        <line x1={cx - capW / 2} x2={cx + capW / 2} y1={yMx} y2={yMx} stroke={color} strokeWidth={1.5} />
        {/* caja Q1-Q3 */}
        <rect x={cx - bw / 2} y={yQ3} width={bw} height={yQ1 - yQ3}
          fill={color} fillOpacity={0.25} stroke={color} strokeWidth={1.5} rx={2} />
        {/* mediana */}
        <line x1={cx - bw / 2} x2={cx + bw / 2} y1={yMed} y2={yMed}
          stroke={color} strokeWidth={2.5} />
      </g>,
    );
  };

  drawBox("ca", C.azul, -(bw * 0.6));
  drawBox("ar", C.ambar, bw * 0.6);
  return <g style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onClickFecha?.(payload.fechaFull); }}>{els}
    <rect x={x} y={y} width={width} height={height} fill="transparent" stroke="none" />
  </g>;
}


function BoxTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background: "var(--fondo)", border: "1px solid var(--borde)", borderRadius: 8, padding: "8px 12px", fontSize: "0.8rem", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {d.ca_med != null && (
        <div style={{ color: C.azul }}>
          <strong>c.A:</strong> min {d.ca_min} · Q1 {d.ca_q1} · med {d.ca_med} · Q3 {d.ca_q3} · max {d.ca_max} <span style={{ opacity: 0.6 }}>(n={d.ca_n})</span>
        </div>
      )}
      {d.ar_med != null && (
        <div style={{ color: C.ambar, marginTop: 2 }}>
          <strong>A.R:</strong> min {d.ar_min} · Q1 {d.ar_q1} · med {d.ar_med} · Q3 {d.ar_q3} · max {d.ar_max} <span style={{ opacity: 0.6 }}>(n={d.ar_n})</span>
        </div>
      )}
    </div>
  );
}

/* ── Barras apiladas: guías capturadas vs sin captura ── */
function CruceBarras({ datos, onClickFecha, fechaSel }: { datos: FilaCruce[]; onClickFecha?: (fecha: string) => void; fechaSel?: string | null }) {
  const flat = datos.map((d) => ({ fecha: d.fecha_str.slice(5), fecha_full: d.fecha_str, en_planta: d.en_planta, sin_captura: d.sin_captura, pct: d.pct_captura }));
  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={flat} margin={{ top: 5, right: 20, bottom: 30, left: 10 }}
          onClick={(state: any) => {
            const f = state?.activePayload?.[0]?.payload?.fecha_full;
            if (f && onClickFecha) onClickFecha(f);
          }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="fecha" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number, name: string) => [v, name === "en_planta" ? "En planta" : "Sin captura"]}
            contentStyle={{ borderRadius: 8, fontSize: "0.8rem" }} />
          <Legend verticalAlign="top" height={30} formatter={(v) => v === "en_planta" ? "En planta" : "Sin captura"} />
          <Bar dataKey="en_planta" stackId="a" fill={C.verde} radius={[0, 0, 0, 0]} cursor="pointer">
            {flat.map((d) => <Cell key={d.fecha} fillOpacity={fechaSel === d.fecha_full ? 1 : 0.7} />)}
          </Bar>
          <Bar dataKey="sin_captura" stackId="a" fill={C.rojo} radius={[3, 3, 0, 0]} cursor="pointer">
            {flat.map((d) => <Cell key={d.fecha} fillOpacity={fechaSel === d.fecha_full ? 1 : 0.7} />)}
          </Bar>
          <Brush dataKey="fecha" height={25} stroke={C.verde} startIndex={0}
            travellerWidth={8} fill="var(--fondo)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Barras horizontales por fundo ── */
function CruceFundos({ datos }: { datos: FilaFundo[] }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={Math.max(datos.length * 50 + 40, 150)}>
        <BarChart data={datos} layout="vertical" margin={{ top: 5, right: 40, bottom: 5, left: 10 }} barSize={24}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis dataKey="FUNDO" type="category" tick={{ fontSize: 11 }} width={110} />
          <Tooltip formatter={(v: number, name: string) => [v, name === "en_planta" ? "En planta" : "Sin captura"]}
            contentStyle={{ borderRadius: 8, fontSize: "0.8rem" }} />
          <Legend verticalAlign="top" height={30} formatter={(v) => v === "en_planta" ? "En planta" : "Sin captura"} />
          <Bar dataKey="en_planta" stackId="a" fill={C.verde} />
          <Bar dataKey="sin_captura" stackId="a" fill={C.rojo} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Tabla de detalle de guías ── */
function TablaDetalle({ filas }: { filas: DetalleRow[] }) {
  if (!filas.length) return <p style={{ fontSize: "0.85rem", color: "var(--texto-tenue)" }}>Sin datos para esta fecha.</p>;
  const [orden, setOrden] = useState<"ca" | "ar">("ca");
  const sorted = useMemo(() => {
    return [...filas].sort((a, b) => {
      const va = orden === "ca" ? (a.ca_min ?? 999) : (a.ar_min ?? 999);
      const vb = orden === "ca" ? (b.ca_min ?? 999) : (b.ar_min ?? 999);
      return va - vb;
    });
  }, [filas, orden]);

  const th: React.CSSProperties = { padding: "6px 10px", fontSize: "0.75rem", textAlign: "left", borderBottom: "2px solid var(--borde)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--fondo)" };
  const td: React.CSSProperties = { padding: "5px 10px", fontSize: "0.8rem", borderBottom: "1px solid var(--borde)" };

  return (
    <div style={{ maxHeight: 400, overflow: "auto", border: "1px solid var(--borde)", borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Guía</th>
            <th style={th}>Fundo</th>
            <th style={th}>Turno</th>
            <th style={th}>Envío Campo (G)</th>
            <th style={th}>Recep. Acopio (AE)</th>
            <th style={{ ...th, cursor: "pointer", color: orden === "ca" ? C.azul : undefined }} onClick={() => setOrden("ca")}>c.A (min) {orden === "ca" ? "▼" : ""}</th>
            <th style={th}>Envío Acopio (AH)</th>
            <th style={th}>Recep. Planta (F)</th>
            <th style={{ ...th, cursor: "pointer", color: orden === "ar" ? C.ambar : undefined }} onClick={() => setOrden("ar")}>A.R (min) {orden === "ar" ? "▼" : ""}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} style={{ background: i % 2 ? "transparent" : "var(--fondo-alt, rgba(0,0,0,0.02))" }}>
              <td style={td}>{r.guia}</td>
              <td style={td}>{r.fundo}</td>
              <td style={td}>{r.turno}</td>
              <td style={td}>{r.hora_envio_campo ?? "—"}</td>
              <td style={td}>{r.hora_recep_acopio ?? "—"}</td>
              <td style={{ ...td, fontWeight: 600, color: C.azul }}>{r.ca_min != null ? r.ca_min : "—"}</td>
              <td style={td}>{r.hora_envio_acopio ?? "—"}</td>
              <td style={td}>{r.hora_recep_planta ?? "—"}</td>
              <td style={{ ...td, fontWeight: 600, color: C.ambar }}>{r.ar_min != null ? r.ar_min : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Placas: totales según filtros principales ── */
function PlacasChart({ datos, fechaSel }: { datos: PlacasResp; fechaSel?: string | null }) {
  const [placaSel, setPlacaSel] = useState("");

  const placas = useMemo(() => {
    if (!fechaSel) return datos.por_placa;
    const filtrado = datos.por_placa_fecha.filter((d) => d.fecha === fechaSel);
    return filtrado
      .sort((a, b) => (b.jabas + b.jarras) - (a.jabas + a.jarras))
      .map((d) => ({ ...d, fechas: 1 }));
  }, [datos, fechaSel]);

  const detallePlaca = useMemo(() => {
    if (!placaSel) return [];
    return datos.por_placa_fecha
      .filter((d) => d.PLACA === placaSel)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [datos, placaSel]);

  const totalGen = useMemo(() => {
    return placas.reduce((acc, d) => ({ jabas: acc.jabas + d.jabas, jarras: acc.jarras + d.jarras, viajes: acc.viajes + d.viajes }), { jabas: 0, jarras: 0, viajes: 0 });
  }, [placas]);

  const maxViajes = useMemo(() => Math.max(...placas.map((p) => p.viajes), 1), [placas]);
  const maxTotal = useMemo(() => Math.max(...placas.map((p) => p.jabas + p.jarras), 1), [placas]);

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <div>
      {/* Resumen cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: "1rem" }}>
        {[
          { label: "Placas", value: placas.length, color: "var(--texto)" },
          { label: "Viajes", value: totalGen.viajes, color: "#8b5cf6" },
          { label: "Jabas", value: totalGen.jabas, color: C.verde },
          { label: "Jarras", value: totalGen.jarras, color: C.azul },
        ].map((c) => (
          <div key={c.label} style={{ textAlign: "center", padding: "8px 4px", borderRadius: 8, background: "var(--fondo-alt, rgba(0,0,0,0.02))" }}>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: c.color }}>{fmt(c.value)}</div>
            <div style={{ fontSize: "0.65rem", color: "var(--texto-tenue)", textTransform: "uppercase", letterSpacing: 0.5 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Cards por placa */}
      <div style={{ maxHeight: 400, overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {placas.map((p, i) => {
          const sel = p.PLACA === placaSel;
          const pctViajes = (p.viajes / maxViajes) * 100;
          const pctJabas = (p.jabas / maxTotal) * 100;
          const pctJarras = (p.jarras / maxTotal) * 100;
          return (
            <div key={p.PLACA} onClick={() => setPlacaSel(sel ? "" : p.PLACA)}
              style={{
                cursor: "pointer", padding: "10px 14px", borderRadius: 10,
                border: sel ? `2px solid ${C.azul}` : "1px solid var(--borde)",
                background: sel ? "rgba(67,97,238,0.06)" : "var(--fondo)",
                transition: "all 0.15s",
              }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 22, height: 22, borderRadius: "50%", fontSize: "0.65rem", fontWeight: 700,
                    background: i < 3 ? C.azul : "var(--borde)", color: i < 3 ? "#fff" : "var(--texto-tenue)",
                  }}>{i + 1}</span>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{p.PLACA}</span>
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: "0.75rem" }}>
                  <span style={{ color: "#8b5cf6" }}>{p.viajes} viajes</span>
                  <span style={{ color: "var(--texto-tenue)" }}>{p.fechas} días</span>
                </div>
              </div>
              {/* Barras proporcionales */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--borde)", overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pctJabas + pctJarras}%`, display: "flex" }}>
                    <div style={{ width: pctJabas > 0 ? `${(pctJabas / (pctJabas + pctJarras)) * 100}%` : "0", background: C.verde, height: "100%" }} />
                    <div style={{ flex: 1, background: C.azul, height: "100%", borderRadius: "0 3px 3px 0" }} />
                  </div>
                </div>
                <span style={{ fontSize: "0.7rem", color: C.verde, fontWeight: 600, minWidth: 40, textAlign: "right" }}>{fmt(p.jabas)}</span>
                <span style={{ fontSize: "0.7rem", color: C.azul, fontWeight: 600, minWidth: 40, textAlign: "right" }}>{fmt(p.jarras)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Historial de la placa seleccionada (solo sin fecha fija) */}
      {!fechaSel && placaSel && detallePlaca.length > 0 && (
        <div style={{ marginTop: "1rem", padding: "0.75rem", border: "1.5px solid rgba(67,97,238,0.2)", borderRadius: 10, background: "rgba(67,97,238,0.04)" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ background: C.azul, color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: "0.8rem" }}>{placaSel}</span>
            Historial — {detallePlaca.length} días
            <button onClick={() => setPlacaSel("")} style={{ marginLeft: "auto", fontSize: "0.75rem", cursor: "pointer", background: "none", border: "1px solid var(--borde)", borderRadius: 6, padding: "2px 8px", color: "var(--texto-tenue)" }}>✕</button>
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={detallePlaca} margin={{ top: 5, right: 20, bottom: 30, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="fecha" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={50}
                tickFormatter={(v: string) => v.slice(5)} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: "0.8rem" }}
                formatter={(v: number, name: string) => [v, name === "jabas" ? "Jabas" : name === "jarras" ? "Jarras" : name === "viajes" ? "Viajes" : name]}
                labelFormatter={(l: string) => {
                  const row = detallePlaca.find((d) => d.fecha === l);
                  return `${l}${row?.tipos ? ` — ${row.tipos}` : ""}`;
                }} />
              <Legend verticalAlign="top" height={30} formatter={(v) => v === "jabas" ? "Jabas" : v === "jarras" ? "Jarras" : v === "viajes" ? "Viajes" : v} />
              <Bar dataKey="jabas" yAxisId="left" fill={C.verde} fillOpacity={0.7} radius={[3, 3, 0, 0]} barSize={16} />
              <Bar dataKey="jarras" yAxisId="left" fill={C.azul} fillOpacity={0.7} radius={[3, 3, 0, 0]} barSize={16} />
              <Line type="monotone" dataKey="viajes" yAxisId="right" stroke="#8b5cf6" strokeWidth={2.5}
                dot={{ r: 3, fill: "#8b5cf6" }} name="viajes" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
