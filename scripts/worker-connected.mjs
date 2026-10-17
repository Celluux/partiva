import { spawn } from "node:child_process";
import { runSupabase } from "./supabase-auth.mjs";
import {
  PROJECT,
  SUPABASE_URL,
  requireInstance,
} from "./lib/instance-config.mjs";
requireInstance();
// Privileged key is kept only in the child environment, never in arguments or files.
const result = runSupabase(
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
if (result.status !== 0)
  throw new Error("Acesso protegido à instalação indisponível.");
const parsed = JSON.parse(result.stdout),
  keys = Array.isArray(parsed) ? parsed : parsed.api_keys || parsed.data;
const secret =
  keys.find((k) => k.type === "secret") ||
  keys.find((k) => k.name === "service_role");
const publicKey =
  keys.find((k) => k.type === "publishable") ||
  keys.find((k) => k.name === "anon");
const key = (k) => k?.api_key || k?.key;
if (!key(secret) || !key(publicKey))
  throw new Error("Chaves do projeto não disponíveis.");
const child = spawn(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--config",
    "worker/wrangler.jsonc",
    "--var",
    `SUPABASE_URL=${SUPABASE_URL}`,
    "--var",
    `ALLOWED_ORIGIN=${process.env.ALLOWED_ORIGIN || "http://127.0.0.1:5173"}`,
  ],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      NODE_USE_SYSTEM_CA: "1",
      SUPABASE_SECRET_KEY: key(secret),
      SUPABASE_PUBLISHABLE_KEY: key(publicKey),
    },
  },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
