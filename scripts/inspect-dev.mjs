import { runSupabase } from "./supabase-auth.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PROJECT, requireInstance } from "./lib/instance-config.mjs";
requireInstance();
const commands = [
  [
    "connection",
    [
      "db",
      "query",
      "--linked",
      "--project-ref",
      PROJECT,
      "select current_database() as database, current_user as role, version() as version",
      "--output",
      "json",
    ],
  ],
  [
    "migrations",
    [
      "migration",
      "list",
      "--linked",
      "--project-ref",
      PROJECT,
      "--output",
      "json",
    ],
  ],
  [
    "schema",
    [
      "db",
      "query",
      "--linked",
      "--project-ref",
      PROJECT,
      "--file",
      "supabase/validation/inspect.sql",
      "--output",
      "json",
    ],
  ],
  [
    "advisors",
    [
      "db",
      "advisors",
      "--linked",
      "--project-ref",
      PROJECT,
      "--type",
      "all",
      "--level",
      "warn",
      "--output",
      "json",
    ],
  ],
];
const report = {
  PROJECT,
  checked_at: new Date().toISOString(),
  read_only: true,
  checks: {},
};
await mkdir("artifacts/private", { recursive: true });
for (const [name, args] of commands) {
  const result = runSupabase(args, { capture: true, timeout: 90000 });
  report.checks[name] = {
    success: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
  console.log(
    `${name}: ${result.status === 0 ? "verificação executada" : "pendente ou bloqueada"}`,
  );
  if (name === "connection" && result.status !== 0) {
    console.error(
      "A conexão com PARTIVAA não foi estabelecida. Nenhuma operação de escrita foi executada.",
    );
    process.exitCode = 1;
    break;
  }
}
await writeFile(
  "artifacts/private/dev-inspection.json",
  JSON.stringify(report, null, 2),
);
if (Object.values(report.checks).some((c) => !c.success)) process.exitCode = 1;
console.log(
  "Relatório de leitura salvo localmente em artifacts/private/dev-inspection.json.",
);
