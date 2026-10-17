import { createClient } from "@supabase/supabase-js";
import { runSupabase } from "../supabase-auth.mjs";
import { PROJECT, SUPABASE_URL, requireInstance } from "./instance-config.mjs";
requireInstance();
export function serviceAccess() {
  const r = runSupabase(
    [
      "projects",
      "api-keys",
      "--project-ref",
      PROJECT,
      "--reveal",
      "--output",
      "json",
    ],
    { capture: true },
  );
  if (r.status !== 0)
    throw new Error("Acesso protegido ao PARTIVAA indisponível.");
  const j = JSON.parse(r.stdout),
    a = Array.isArray(j) ? j : j.api_keys || j.data;
  const key = (x) => x?.api_key || x?.key;
  const secret = key(
    a.find((x) => x.type === "secret") ||
      a.find((x) => x.name === "service_role"),
  );
  if (!secret) throw new Error("Chave administrativa não disponível.");
  return createClient(SUPABASE_URL, secret, {
    db: { retry: false },
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal || AbortSignal.timeout(120000),
        }),
    },
  });
}
export function checked(r) {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
export function sqlRead(sql) {
  const r = runSupabase(
    [
      "db",
      "query",
      "--linked",
      "--project-ref",
      PROJECT,
      sql,
      "--output",
      "json",
    ],
    { capture: true, timeout: 120000 },
  );
  if (r.status !== 0) throw new Error(r.stderr || "Falha de leitura SQL");
  return JSON.parse(r.stdout).rows;
}
