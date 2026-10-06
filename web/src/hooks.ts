import { useEffect, useRef, useState } from "react";
import { AuthRequerida, getJson } from "./api";

export function useDatos<T>(url: string | null) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [authDest, setAuthDest] = useState<string | null>(null);
  const reintento = useRef(0);

  useEffect(() => {
    if (!url) return;
    let cancelado = false;
    const ctrl = new AbortController();

    const pedir = () => {
      setCargando(true);
      setError(null);
      getJson<T>(url, ctrl.signal)
        .then((d) => {
          if (cancelado) return;
          setDatos(d);
          setAuthDest(null);
          setCargando(false);
          reintento.current = 0;
        })
        .catch((e) => {
          if (cancelado || ctrl.signal.aborted) return;
          if (e instanceof AuthRequerida) {
            setAuthDest(e.destino);
            setCargando(false);
            reintento.current += 1;
            if (reintento.current < 60) {
              setTimeout(pedir, 5000);
            }
            return;
          }
          setError(e.message);
          setCargando(false);
        });
    };

    pedir();
    return () => { cancelado = true; ctrl.abort(); };
  }, [url]);

  return { datos, error, cargando, authDest };
}
