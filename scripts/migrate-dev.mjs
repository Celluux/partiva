import { runSupabase } from "./supabase-auth.mjs";
import { readFile } from "node:fs/promises";
import { PROJECT, requireInstance } from "./lib/instance-config.mjs";
requireInstance();
// Refuse to operate without an explicit link. No resets, production fallback or automatic deploy.
const linked = (
  await readFile("supabase/.temp/project-ref", "utf8").catch(() => "")
).trim();
if (linked !== PROJECT)
  throw new Error(
    `Vincule primeiro a CLI à instalação: supabase link --project-ref ${PROJECT}.`,
  );
const args = ["db", "push", "--linked", "--skip-vault"];
if (!process.argv.includes("--apply")) args.push("--dry-run");
const result = runSupabase(args);
process.exitCode = result.status ?? 1;
