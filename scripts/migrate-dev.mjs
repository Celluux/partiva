import { runSupabase } from "./supabase-auth.mjs";
import { readFile } from "node:fs/promises";
// Refuse to operate on a link to any other project. No resets, production fallback or automatic deploy.
const project = "twtldgdceidyurinrvsy";
const linked = (
  await readFile("supabase/.temp/project-ref", "utf8").catch(() => "")
).trim();
if (linked !== project)
  throw new Error(
    "Vincule primeiro a CLI exclusivamente ao PARTIVAA: supabase link --project-ref twtldgdceidyurinrvsy.",
  );
const args = ["db", "push", "--linked", "--skip-vault"];
if (!process.argv.includes("--apply")) args.push("--dry-run");
const result = runSupabase(args);
process.exitCode = result.status ?? 1;
