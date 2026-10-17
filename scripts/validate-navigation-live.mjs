// Authorized development validation: reuse the previously approved technical users
// and archived test piece. Never change credentials or records of real employees.
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { serviceAccess, checked, PROJECT } from "./lib/partivaa-service.mjs";
const prior = JSON.parse(
  await readFile("artifacts/private/partivaa-live-validation.json", "utf8"),
);
assert.equal(prior.project, PROJECT);
const root = serviceAccess(),
  users = [],
  checks = [];
let browser;
const members = checked(
  await root
    .from("workspace_members")
    .select("*")
    .in("user_id", prior.validation_users_disabled),
);
const pid = prior.validation_parts_archived[0];
const part = async () =>
  checked(await root.from("parts").select("*").eq("id", pid).single());
const baseline = checked(
  await root
    .from("parts")
    .select("id,internal_number,version,sale_status,listing_status,price_cents")
    .not("legacy_source", "is", null),
);
const photosBefore = checked(
  await root
    .from("part_photos")
    .select("id,storage_path,original_photo_id")
    .not("legacy_photo_key", "is", null),
);
try {
  browser = await chromium.launch({ channel: "msedge" });
  for (const role of ["admin", "viewer"]) {
    const member = members.find((m) => m.role === role);
    assert(member, `Conta técnica ${role} indisponível`);
    const account = checked(
      await root.auth.admin.getUserById(member.user_id),
    ).user;
    assert.equal(account.user_metadata.validation_run, prior.run);
    const password = crypto.randomUUID() + "Aa1!";
    users.push({ member, account });
    checked(
      await root.auth.admin.updateUserById(member.user_id, {
        password,
        ban_duration: "none",
      }),
    );
    checked(
      await root
        .from("workspace_members")
        .update({ active: true })
        .eq("user_id", member.user_id),
    );
    const client = createClient(
      `https://${PROJECT}.supabase.co`,
      root.supabaseKey,
      {
        db: { retry: false },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    checked(
      await client.auth.signInWithPassword({ email: account.email, password }),
    );
    users.at(-1).client = client;
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:5173/");
    await page.getByLabel("E-mail", { exact: true }).fill(account.email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Entrar no Partiva", exact: true })
      .click();
    await expect(page.locator("#application")).toBeVisible({ timeout: 20000 });
    for (const view of [
      "board",
      "table",
      "listings",
      "sales",
      "reservations",
      "activity",
      "company",
    ]) {
      await page.locator(`[data-nav="${view}"]`).click();
      await expect(page.locator(`[data-nav="${view}"]`)).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(page.locator("#workspace-content")).not.toBeEmpty();
      if (view === "table")
        await expect(page.locator("tbody tr")).toHaveCount(201);
      if (view === "listings") {
        await page
          .locator("#commercial-status")
          .selectOption("legacy_published");
        await expect(page.locator("tbody tr")).toHaveCount(57);
      }
      if (view === "sales" && role === "admin")
        await expect(page.locator("#workspace-content")).toContainText("#10");
      if (view === "company" && role === "viewer")
        await expect(
          page.locator('#company-form input[name="legal_name"]'),
        ).toBeDisabled();
      await page.reload();
      await expect(page.locator(`[data-nav="${view}"]`)).toHaveAttribute(
        "aria-current",
        "page",
        { timeout: 15000 },
      );
    }
    if (role === "viewer") {
      const denied = await client.rpc("sale_action", {
        pid,
        command: "reserve",
        payload: {
          request_id: crypto.randomUUID(),
          version: (await part()).version,
        },
      });
      assert.equal(denied.error?.code, "42501");
      await page.locator('[data-nav="reservations"]').click();
      await expect(page.locator("#commercial-new")).toHaveCount(0);
    } else {
      let p = await part();
      checked(
        await client.rpc("part_action", {
          pid,
          command: "restore",
          expected_version: p.version,
        }),
      );
      const command = async (command, payload = {}) =>
        checked(
          await client.rpc("sale_action", {
            pid,
            command,
            payload: {
              request_id: crypto.randomUUID(),
              version: (await part()).version,
              ...payload,
            },
          }),
        );
      await command("reserve", {
        customer: "Validação de navegação",
        note: "Teste técnico autorizado",
      });
      await command("edit_reservation", {
        customer: "Validação atualizada",
        note: "Reserva editada",
      });
      await page.locator('[data-nav="reservations"]').click();
      await page.locator("#refresh-data").click();
      await expect(page.locator("#workspace-content")).toContainText(
        "Validação atualizada",
      );
      await command("sell_local", { amount_cents: 12345 });
      const duplicate = await client.rpc("sale_action", {
        pid,
        command: "sell_local",
        payload: {
          request_id: crypto.randomUUID(),
          version: (await part()).version,
          amount_cents: 12345,
        },
      });
      assert(duplicate.error);
      await page.locator('[data-nav="sales"]').click();
      await page.locator("#refresh-data").click();
      await expect(page.locator("#workspace-content")).toContainText("123,45");
      await command("cancel", {
        note: "Encerramento de validação de navegação",
      });
      checked(
        await client.rpc("part_action", {
          pid,
          command: "archive",
          expected_version: (await part()).version,
        }),
      );
    }
    checks.push({
      role,
      seven_routes: true,
      reload: true,
      real_supabase: true,
      permissions: true,
    });
    await page.close();
  }
} finally {
  const admin = users.find((u) => u.member.role === "admin")?.client;
  if (admin) {
    let p = await part();
    if (!p.archived_at) {
      if (p.sale_status !== "available")
        checked(
          await admin.rpc("sale_action", {
            pid,
            command: p.sale_status === "reserved" ? "release" : "cancel",
            payload: {
              request_id: crypto.randomUUID(),
              version: p.version,
              note: "Encerramento seguro de teste",
            },
          }),
        );
      p = await part();
      checked(
        await admin.rpc("part_action", {
          pid,
          command: "archive",
          expected_version: p.version,
        }),
      );
    }
  }
  await browser?.close();
  for (const { member, client } of users) {
    await client?.auth.signOut({ scope: "global" });
    checked(
      await root
        .from("workspace_members")
        .update({ active: member.active })
        .eq("user_id", member.user_id),
    );
    checked(
      await root.auth.admin.updateUserById(member.user_id, {
        ban_duration: "876000h",
      }),
    );
  }
  const after = checked(
    await root
      .from("parts")
      .select(
        "id,internal_number,version,sale_status,listing_status,price_cents",
      )
      .not("legacy_source", "is", null),
  );
  const photosAfter = checked(
    await root
      .from("part_photos")
      .select("id,storage_path,original_photo_id")
      .not("legacy_photo_key", "is", null),
  );
  const sort = (a) => a.sort((x, y) => x.id.localeCompare(y.id));
  assert.deepEqual(sort(after), sort(baseline));
  assert.deepEqual(sort(photosAfter), sort(photosBefore));
  await writeFile(
    "artifacts/private/navigation-live-validation.json",
    JSON.stringify(
      {
        project: PROJECT,
        checks,
        preserved_imported_parts: baseline.length,
        preserved_imported_photos: photosBefore.length,
        checked_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}
console.log(
  JSON.stringify({
    checks,
    parts_preserved: baseline.length,
    photos_preserved: photosBefore.length,
  }),
);
