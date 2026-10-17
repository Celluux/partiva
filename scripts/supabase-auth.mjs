import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
export function cliEnvironment() {
  const env = { ...process.env, NODE_USE_SYSTEM_CA: "1" };
  if (env.SUPABASE_ACCESS_TOKEN) return env;
  const directory = join(
    process.env.LOCALAPPDATA || "",
    "Partiva",
    "CodexCredentials",
  );
  if (
    process.platform !== "win32" ||
    !existsSync(join(directory, "supabase-cli-token.dpapi"))
  )
    return env;
  const script = String.raw`$ErrorActionPreference='Stop';Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop;$path=Join-Path $env:LOCALAPPDATA 'Partiva\CodexCredentials\supabase-cli-token.dpapi';$secure=ConvertTo-SecureString ([IO.File]::ReadAllText($path));$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);try{[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$secure.Dispose()}`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0)
    throw new Error(
      "O Windows não liberou a credencial protegida para este usuário. Configure novamente no terminal local.",
    );
  env.SUPABASE_ACCESS_TOKEN = result.stdout.trim();
  if (!env.SUPABASE_ACCESS_TOKEN)
    throw new Error("Credencial protegida vazia.");
  return env;
}
export function runSupabase(args, { capture = false, timeout = 60000 } = {}) {
  if (
    !capture &&
    ((args[0] === "projects" && args[1] === "api-keys") ||
      (args[0] === "db" && args[1] === "dump" && args.includes("--dry-run")))
  )
    throw new Error(
      "Este comando pode exibir credenciais. Use captura privada em memória, sem imprimir a saída.",
    );
  if (
    args.includes("--debug") ||
    args.some((arg) => /^(trace|debug)$/.test(arg))
  )
    throw new Error(
      "Logs detalhados estão desativados para proteger a credencial.",
    );
  return spawnSync(
    process.execPath,
    ["node_modules/supabase/dist/supabase.js", ...args],
    {
      env: cliEnvironment(),
      encoding: "utf8",
      stdio: capture ? "pipe" : "inherit",
      timeout,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    },
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = runSupabase(process.argv.slice(2));
  process.exitCode = result.status ?? 1;
}
