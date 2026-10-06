export const apiUrl = (path: string) => {
  const base = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  return `${base}${path}`;
};

export class AuthRequerida extends Error {
  constructor(public destino: string) {
    super(`Autenticación requerida (${destino})`);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function conQuery(base: string, params: Query) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, String(v));
  }
  const q = sp.toString();
  return q ? `${base}?${q}` : base;
}

export async function getJson<T>(url: string, signal?: AbortSignal | null): Promise<T> {
  const resp = await fetch(apiUrl(url), { signal: signal ?? undefined });
  if (resp.status === 401) {
    const body = await resp.json().catch(() => ({}));
    if (body.tipo === "auth") throw new AuthRequerida(body.destino);
  }
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ detalle: resp.statusText }));
    throw new Error(body.detalle ?? `HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(apiUrl(url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}
