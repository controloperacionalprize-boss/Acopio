import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { apiUrl } from "./api";

type Pendiente = {
  destino: string;
  estado: "esperando" | "ok" | "error";
  user_code: string;
  verification_uri: string;
  error: string | null;
};

const NOMBRES: Record<string, string> = {
  sharepoint_my: "OneDrive (Acopio)",
};

export default function AvisoAuth() {
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);

  useEffect(() => {
    const revisar = async () => {
      try {
        const resp = await fetch(apiUrl("/api/auth/estado"));
        if (resp.ok) {
          const data = await resp.json();
          setPendientes(data.pendientes ?? []);
        }
      } catch { /* sin conexión */ }
    };
    revisar();
    const id = setInterval(revisar, 5000);
    return () => clearInterval(id);
  }, []);

  const esperando = pendientes.filter((p) => p.estado === "esperando");
  if (!esperando.length) return null;

  return (
    <>
      {esperando.map((p) => (
        <div key={p.destino} className="auth-aviso">
          <KeyRound size={20} style={{ marginBottom: 4 }} />
          <div>
            Ingresá el código en{" "}
            <a href={p.verification_uri} target="_blank" rel="noopener">
              {p.verification_uri}
            </a>{" "}
            para conectar <strong>{NOMBRES[p.destino] ?? p.destino}</strong>:
          </div>
          <code>{p.user_code}</code>
        </div>
      ))}
    </>
  );
}
