import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
// Read-only external smoke test. Never create test records in shared remote data.
try {
  const content = await readFile(".env.local", "utf8").catch(() => "");
  const value = (name) =>
    process.env[name] ||
    content.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim();
  const key = value("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!key) throw new Error("Falta a chave pública desta instalação.");
  const url = value("VITE_SUPABASE_URL");
  if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))
    throw new Error("VITE_SUPABASE_URL inválida.");
  const email = process.env.PARTIVA_TEST_EMAIL,
    password = process.env.PARTIVA_TEST_PASSWORD;
  if (!email || !password)
    throw new Error(
      "Falta conta de teste autorizada (PARTIVA_TEST_EMAIL/PARTIVA_TEST_PASSWORD).",
    );
  const client = createClient(url, key, { auth: { persistSession: false } });
  try {
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    for (const table of [
      "workspace_members",
      "workspaces",
      "board_columns",
      "parts",
      "part_photos",
      "part_events",
    ]) {
      const result = await client
        .from(table)
        .select("*", { count: "exact", head: true });
      if (result.error) throw result.error;
      console.log(`${table}: leitura autorizada confirmada`);
    }
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
} catch (error) {
  console.error(`Verificação externa pendente: ${error.message}`);
  process.exitCode = 1;
}
