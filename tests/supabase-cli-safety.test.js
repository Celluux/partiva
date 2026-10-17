import { it, expect } from "vitest";
import { runSupabase } from "../scripts/supabase-auth.mjs";
it("blocks API-key output before accessing credentials or running the CLI", () => {
  expect(() => runSupabase(["projects", "api-keys", "--reveal"])).toThrow(
    /credenciais/,
  );
});
it("blocks dump dry-run output that includes a temporary database password", () => {
  expect(() => runSupabase(["db", "dump", "--dry-run"])).toThrow(/credenciais/);
});
