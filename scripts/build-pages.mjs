import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const profileArg = process.argv.find((value) => value.startsWith("--profile="));
if (!profileArg) {
  throw new Error("Informe --profile=deployments/<instalacao> para o build do Pages.");
}

const profileDir = resolve(profileArg.slice("--profile=".length));
const configPath = resolve(profileDir, "frontend.public.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const url = String(config.supabaseUrl || "").trim();
const key = String(config.supabasePublishableKey || "").trim();
const apiUrl = String(config.apiUrl || "/api").trim();

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))
  throw new Error("Perfil de instalação com URL Supabase inválida.");
if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))
  throw new Error("O perfil deve conter somente uma chave Supabase publicável.");
if (!apiUrl.startsWith("/")) throw new Error("VITE_API_URL deve ser relativo.");

process.env.VITE_SUPABASE_URL = url;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = key;
process.env.VITE_API_URL = apiUrl;

const vite = resolve("node_modules", "vite", "bin", "vite.js");
const result = spawnSync(process.execPath, [vite, "build"], {
  stdio: "inherit",
  shell: false,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
