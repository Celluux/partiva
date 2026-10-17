import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { runSupabase } from "./supabase-auth.mjs";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
if (!process.argv.includes("--allow-writes"))
  throw new Error("Exige autorização e --allow-writes.");
const report = JSON.parse(
  await readFile("artifacts/private/partivaa-live-validation.json", "utf8"),
);
const project = "twtldgdceidyurinrvsy";
assert.equal(report.project, project);
const r = runSupabase(
  [
    "projects",
    "api-keys",
    "--reveal",
    "--project-ref",
    project,
    "--output",
    "json",
  ],
  { capture: true },
);
if (r.status !== 0) throw new Error("Falha de acesso protegido");
const parsed = JSON.parse(r.stdout),
  keys = Array.isArray(parsed) ? parsed : parsed.api_keys || parsed.data,
  key = (x) => x.api_key || x.key;
const publicKey = key(
  keys.find((k) => k.type === "publishable") ||
    keys.find((k) => k.name === "anon"),
);
const serviceKey = key(
  keys.find((k) => k.type === "secret") ||
    keys.find((k) => k.name === "service_role"),
);
const opts = {
  db: { retry: false },
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
  },
};
const root = createClient(`https://${project}.supabase.co`, serviceKey, opts),
  client = createClient(`https://${project}.supabase.co`, publicKey, opts);
const ok = (r) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const uid = report.validation_users_disabled[0],
  pid = report.validation_parts_archived[0];
const checks = [];
let browser;
const part = async () =>
  ok(await root.from("parts").select("*").eq("id", pid).single());
try {
  const user = ok(await root.auth.admin.getUserById(uid)).user;
  assert.equal(user.user_metadata.validation_run, report.run);
  const password = crypto.randomUUID() + "Aa1!";
  ok(
    await root.auth.admin.updateUserById(uid, {
      password,
      ban_duration: "none",
    }),
  );
  ok(
    await root
      .from("workspace_members")
      .update({ active: true })
      .eq("user_id", uid),
  );
  ok(await client.auth.signInWithPassword({ email: user.email, password }));
  let p = await part();
  if (p.archived_at)
    ok(
      await client.rpc("part_action", {
        pid,
        command: "restore",
        expected_version: p.version,
      }),
    );
  p = await part();
  const company = ok(await client.from("workspaces").select("*").single());
  const column = ok(
    await client
      .from("board_columns")
      .select("*")
      .order("position")
      .limit(1)
      .single(),
  );
  const calls = [
    [
      "save_part",
      {
        payload: { id: pid, part_name: "Conflito" },
        expected_version: p.version - 1,
      },
    ],
    [
      "part_action",
      { pid, command: "archive", expected_version: p.version - 1 },
    ],
    [
      "sale_action",
      {
        pid,
        command: "reserve",
        payload: { request_id: crypto.randomUUID(), version: p.version - 1 },
      },
    ],
    [
      "company_save",
      { payload: { fee_percent: 10 }, expected_version: company.version - 1 },
    ],
    [
      "column_action",
      {
        command: "update",
        payload: {
          id: column.id,
          version: column.version - 1,
          name: column.name,
          color: column.color,
          phase: column.phase,
        },
      },
    ],
  ];
  for (const [name, args] of calls) {
    const start = Date.now();
    const result = await client.rpc(name, args);
    assert.equal(result.error?.code, "PT409");
    assert.equal(result.status, 409);
    assert(Date.now() - start < 5000);
    checks.push({ name: `Conflito ${name}: HTTP 409 imediato`, passed: true });
    console.log(`OK: ${name} sem repetição`);
  }
  browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5173");
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Entrar no Partiva", exact: true })
    .click();
  await expect(page.locator("#application")).toBeVisible({ timeout: 20000 });
  await page
    .getByRole("button", {
      name: new RegExp(`Abrir peça ${p.internal_number} `),
    })
    .first()
    .click();
  await page
    .getByRole("button", { name: "3. Anúncio e preço", exact: true })
    .click();
  await page
    .getByLabel("Preço de anúncio (R$)", { exact: true })
    .fill("123,46");
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(page.locator("#save-status")).toHaveText("Salvo no banco", {
    timeout: 10000,
  });
  assert.equal((await part()).price_cents, 12346);
  await page.locator("#done-piece").click();
  await page.getByRole("button", { name: "Tabela", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("123,46");
  await page.reload();
  await expect(page.locator("#application")).toBeVisible({ timeout: 20000 });
  await expect(
    page
      .getByRole("button", {
        name: new RegExp(`Abrir peça ${p.internal_number} `),
      })
      .first(),
  ).toBeVisible();
  checks.push({
    name: "Navegador real: login, edição, tabela, recarga e persistência PostgreSQL",
    passed: true,
  });
  console.log(
    "OK: Navegador real conectado ao Supabase, sem interceptação ou dados locais",
  );
} catch (e) {
  process.exitCode = 1;
  checks.push({ name: "Falha", passed: false, error: e.message });
  console.error(e.message);
} finally {
  await browser?.close();
  const p = await part();
  if (!p.archived_at)
    ok(
      await client.rpc("part_action", {
        pid,
        command: "archive",
        expected_version: p.version,
      }),
    );
  ok(
    await root
      .from("workspace_members")
      .update({ active: false })
      .eq("user_id", uid),
  );
  ok(await root.auth.admin.updateUserById(uid, { ban_duration: "876000h" }));
  await client.auth.signOut({ scope: "local" });
  await writeFile(
    "artifacts/private/partivaa-live-browser.json",
    JSON.stringify(
      {
        project,
        checked_at: new Date().toISOString(),
        checks,
        account_disabled: true,
        piece_archived: true,
      },
      null,
      2,
    ),
  );
}
