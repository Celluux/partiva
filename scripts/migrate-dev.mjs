import { runSupabase } from "./supabase-auth.mjs";
import { readFile } from "node:fs/promises";
// Refuse to operate on a link to any other project. No resets, production fallback or automatic deploy.
const project = "jelqadbfyfmouulhsvvs";
const linked = (
  await readFile("supabase/.temp/project-ref", "utf8").catch(() => "")
).trim();
if (linked !== project)
  throw new Error(
    "Vincule primeiro a CLI exclusivamente ao partiva-dev: supabase link --project-ref jelqadbfyfmouulhsvvs.",
  );
const args = ["db", "push", "--linked"];
if (!process.argv.includes("--apply")) args.push("--dry-run");
const result = runSupabase(args);
process.exitCode = result.status ?? 1;
