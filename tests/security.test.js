import { beforeAll, afterAll, it, expect } from "vitest";
import { database, rpc, asUser, COMPANY, USERS } from "./helpers/database.js";
let db;
beforeAll(async () => {
  db = await database();
});
afterAll(() => db?.close());
const create = async (payload) =>
  (
    await rpc(db, "admin", "save_part", [
      { id: crypto.randomUUID(), ...payload },
      null,
    ])
  ).part;
it("keeps inactive companies inaccessible and disallows foreign columns", async () => {
  const other = crypto.randomUUID();
  await db.query("insert into public.workspaces(id,name) values($1,$2)", [
    other,
    "Inactive company",
  ]);
  const id = crypto.randomUUID();
  await db.query(
    "insert into public.board_columns(id,workspace_id,name) values($1,$2,$3)",
    [id, other, "Other"],
  );
  const p = await create({ part_name: "Motor" });
  await expect(
    rpc(db, "admin", "save_part", [{ id: p.id, column_id: id }, p.version]),
  ).rejects.toThrow(/Etapa inválida/);
  const rows = await asUser(db, "admin", (tx) =>
    tx.query("select * from public.workspaces"),
  );
  expect(rows.rows).toHaveLength(1);
});
it("revokes inactive employee access immediately, independent of JWT age", async () => {
  await rpc(db, "admin", "member_save", [
    USERS.operator,
    "operator",
    false,
    "Operação",
  ]);
  expect(
    (
      await asUser(db, "operator", (tx) =>
        tx.query("select * from public.parts"),
      )
    ).rows,
  ).toHaveLength(0);
  await expect(
    rpc(db, "operator", "save_part", [{ id: crypto.randomUUID() }, null]),
  ).rejects.toThrow(/permissão/);
  await rpc(db, "admin", "member_save", [
    USERS.operator,
    "operator",
    true,
    "Operação",
  ]);
});
it("does not let users grant themselves administrator access", async () => {
  await expect(
    rpc(db, "operator", "member_save", [
      USERS.operator,
      "admin",
      true,
      "Operação",
    ]),
  ).rejects.toThrow(/administradores/);
  await expect(
    asUser(db, "operator", (tx) =>
      tx.query(
        "update public.workspace_members set role='admin' where user_id=$1",
        [USERS.operator],
      ),
    ),
  ).rejects.toThrow(/permission denied/);
});
it("rejects forged publication and sale flags", async () => {
  const p = await create({ part_name: "Motor" });
  await expect(
    rpc(db, "admin", "save_part", [
      { id: p.id, listing_status: "published" },
      p.version,
    ]),
  ).rejects.toThrow(/não permitido/);
  await expect(
    rpc(db, "admin", "save_part", [
      { id: p.id, sale_status: "sold" },
      p.version,
    ]),
  ).rejects.toThrow(/não permitido/);
});
it("requires real complete data and independent photos before publication readiness", async () => {
  const company = (
    await db.query("select * from public.workspaces where id=$1", [COMPANY])
  ).rows[0];
  await rpc(db, "admin", "company_save", [
    {
      fee_percent: 14,
      fee_fixed_cents: 600,
      fee_configured: true,
      preferences: { minimum_photos: 2 },
    },
    company.version,
  ]);
  const p = await create({
    part_name: "Farol",
    detran_reference: "DETRAN",
    category: "Elétrica",
    brand: "Fiat",
    model: "Argo",
    year: 2020,
    position: "Dianteira",
    side: "Esquerdo",
    title: "Farol Fiat Argo 2020",
    price_cents: 10000,
  });
  for (let i = 0; i < 2; i++) {
    const id = crypto.randomUUID(),
      path = `${COMPANY}/${p.id}/${id}.jpg`;
    await asUser(db, "admin", (tx) =>
      tx.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
        "part-photos",
        path,
      ]),
    );
    await rpc(db, "admin", "photo_action", [
      p.id,
      "register",
      { id, storage_path: path, mime_type: "image/jpeg", size_bytes: 1024 },
    ]);
  }
  let current = (
    await db.query("select * from public.parts where id=$1", [p.id])
  ).rows[0];
  const ready = await rpc(db, "admin", "part_action", [
    p.id,
    "ready",
    current.version,
  ]);
  expect(ready.listing_status).toBe("ready");
  const dest = (
    await db.query(
      "select id from public.board_columns where phase='publication'",
    )
  ).rows[0];
  const moved = await rpc(db, "admin", "save_part", [
    { id: p.id, column_id: dest.id },
    ready.version,
  ]);
  expect(moved.part.operational_status).toBe("publication");
  expect(moved.part.listing_status).not.toBe("published");
  expect(moved.part.sale_status).toBe("available");
});
it("keeps physical originals after soft deletion and restores the same identity", async () => {
  const p = await create({ part_name: "Motor" });
  const archived = await rpc(db, "admin", "part_action", [
    p.id,
    "archive",
    p.version,
  ]);
  const restored = await rpc(db, "admin", "part_action", [
    p.id,
    "restore",
    archived.version,
  ]);
  expect(restored.internal_number).toBe(p.internal_number);
  expect(restored.archived_at).toBe(null);
});
it("validates company CNPJ and disallows raw sensitive writes", async () => {
  let w = (
    await db.query("select * from public.workspaces where id=$1", [COMPANY])
  ).rows[0];
  await expect(
    rpc(db, "admin", "company_save", [{ tax_id: "11111111111111" }, w.version]),
  ).rejects.toThrow(/CNPJ inválido/);
  const saved = await rpc(db, "admin", "company_save", [
    { tax_id: "11222333000181" },
    w.version,
  ]);
  expect(saved.tax_id).toBe("11222333000181");
  await expect(
    asUser(db, "admin", (tx) =>
      tx.exec("update public.workspaces set fee_percent=0"),
    ),
  ).rejects.toThrow(/permission denied/);
});
it("preserves idempotent sales and prevents reservation of sold pieces", async () => {
  const p = await create({ part_name: "Motor" }),
    request = {
      request_id: crypto.randomUUID(),
      version: p.version,
      amount_cents: 10000,
    };
  const a = await rpc(db, "sales", "sale_action", [
      p.id,
      "sell_local",
      request,
    ]),
    b = await rpc(db, "sales", "sale_action", [p.id, "sell_local", request]);
  expect(a.id).toBe(b.id);
  const current = (
    await db.query("select * from public.parts where id=$1", [p.id])
  ).rows[0];
  await expect(
    rpc(db, "sales", "sale_action", [
      p.id,
      "reserve",
      { request_id: crypto.randomUUID(), version: current.version },
    ]),
  ).rejects.toThrow(/reservada ou vendida/);
});
it("keeps immutable history inaccessible for direct tampering", async () => {
  await expect(
    asUser(db, "admin", (tx) => tx.exec("delete from public.part_events")),
  ).rejects.toThrow(/permission denied/);
  await expect(
    asUser(db, "admin", (tx) =>
      tx.exec("update public.part_events set event_type='fake'"),
    ),
  ).rejects.toThrow(/permission denied/);
});
it("does not consume another company logo or storage prefix", async () => {
  await expect(
    asUser(db, "admin", (tx) =>
      tx.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
        "company-assets",
        `${crypto.randomUUID()}/logo/${crypto.randomUUID()}.jpg`,
      ]),
    ),
  ).rejects.toThrow(/row-level security/);
});
