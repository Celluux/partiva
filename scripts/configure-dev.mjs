import { runSupabase } from "./supabase-auth.mjs";
import { writeFileSync } from "node:fs";
// Never reveal or persist the privileged API keys returned by the CLI.
const result = runSupabase(
  [
    "projects",
    "api-keys",
    "--project-ref",
    "twtldgdceidyurinrvsy",
    "--output",
    "json",
  ],
  { capture: true, timeout: 30000 },
);
if (result.status !== 0) {
  console.error(
    "Configuração externa pendente: CLI Supabase sem acesso ao PARTIVAA. Configure VITE_SUPABASE_PUBLISHABLE_KEY em .env.local.",
  );
  process.exitCode = 1;
} else {
  let rows;
  try {
    const parsed = JSON.parse(result.stdout);
    rows = Array.isArray(parsed) ? parsed : parsed.api_keys || parsed.data;
  } catch {
    throw new Error(
      "A CLI não retornou uma lista de chaves válida. Nenhuma credencial foi exibida.",
    );
  }
  if (!Array.isArray(rows))
    throw new Error("Formato da lista de chaves não reconhecido.");
  const key =
    rows.find((row) => row.type === "publishable") ||
    rows.find((row) => row.name === "anon");
  const publicKey = key?.api_key || key?.key;
  const isAnon = () => {
    try {
      return (
        JSON.parse(Buffer.from(publicKey.split(".")[1], "base64url").toString())
          .role === "anon"
      );
    } catch {
      return false;
    }
  };
  if (!publicKey || (!publicKey.startsWith("sb_publishable_") && !isAnon()))
    throw new Error("Nenhuma chave pública segura foi encontrada.");
  writeFileSync(
    ".env.local",
    `VITE_SUPABASE_URL=https://twtldgdceidyurinrvsy.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=${publicKey}\nVITE_API_URL=/api\n`,
  );
  console.log(
    "Chave pública do PARTIVAA configurada localmente. Nenhum segredo foi gravado.",
  );
}
