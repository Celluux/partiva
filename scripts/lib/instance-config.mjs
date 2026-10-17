import { readFileSync } from "node:fs";

const local = (() => {
  try {
    return readFileSync(".env.local", "utf8");
  } catch {
    return "";
  }
})();
const value = (name) =>
  process.env[name] ||
  local.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim() ||
  "";
export const SUPABASE_URL = value("VITE_SUPABASE_URL");
export const PROJECT =
  process.env.PARTIVA_SUPABASE_PROJECT_REF ||
  SUPABASE_URL.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co$/)?.[1] ||
  "";
export function requireInstance() {
  if (!PROJECT || !SUPABASE_URL)
    throw new Error("Configure VITE_SUPABASE_URL para esta instalação.");
  return { project: PROJECT, url: SUPABASE_URL };
}
