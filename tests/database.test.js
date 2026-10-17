import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { database, rpc, asUser, USERS, COMPANY } from "./helpers/database.js";
let db;
beforeAll(async () => {
  db = await database();
});
afterAll(async () => {
  await db?.close();
});
const create = (role = "operator", payload = {}) =>
  rpc(db, role, "save_part", [{ id: crypto.randomUUID(), ...payload }, null]);
describe("PostgreSQL operational integration", () => {
  it("saves an incomplete draft with server identity", async () => {
    const { part } = await create();
    expect(Number(part.internal_number)).toBeGreaterThan(0);
    expect(part.title).toBe("");
    expect(part.sale_status).toBe("available");
  });
  it("allocates unique numbers for simultaneous callers", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => create()),
    );
    const numbers = results.map((x) => String(x.part.internal_number));
    expect(new Set(numbers).size).toBe(20);
  });
  it("denies edits and duplicate assignments of the identity", async () => {
    await expect(create("operator", { internal_number: 42 })).rejects.toThrow(
      /não permitido/,
    );
    const { part } = await create();
    await expect(
      db.query("update public.parts set internal_number=42 where id=$1", [
        part.id,
      ]),
    ).rejects.toThrow(/Identidade/);
  });
  it("archives without reusing the number or destroying history", async () => {
    const { part } = await create();
    await rpc(db, "operator", "part_action", [
      part.id,
      "archive",
      part.version,
    ]);
    const next = await create();
    expect(Number(next.part.internal_number)).toBeGreaterThan(
      Number(part.internal_number),
    );
    expect(
      (
        await db.query(
          "select count(*) as n from public.part_events where part_id=$1",
          [part.id],
        )
      ).rows[0].n,
    ).toBeGreaterThan(0);
    await expect(
      db.query("delete from public.parts where id=$1", [part.id]),
    ).rejects.toThrow(/exclusão controlada/);
  });
  it("edits with optimistic concurrency and rejects stale saves", async () => {
    const { part } = await create();
    const saved = await rpc(db, "operator", "save_part", [
      { id: part.id, part_name: "Motor" },
      part.version,
    ]);
    expect(saved.part.part_name).toBe("Motor");
    await expect(
      rpc(db, "operator", "save_part", [
        { id: part.id, part_name: "Outro" },
        part.version,
      ]),
    ).rejects.toThrow(/outra pessoa/);
    await expect(
      rpc(db, "operator", "save_part", [
        { id: part.id, part_name: "Conflito" },
        part.version,
      ]),
    ).rejects.toMatchObject({ code: "PT409" });
  });
  it("allows repeated Detran with a warning", async () => {
    const ref = crypto.randomUUID();
    await create("operator", { detran_reference: ref });
    expect(
      (await create("operator", { detran_reference: ref })).duplicates,
    ).toBe(1);
  });
  it("blocks publication preparation with missing information", async () => {
    const { part } = await create();
    await expect(
      rpc(db, "operator", "part_action", [part.id, "ready", part.version]),
    ).rejects.toThrow(/Pendências/);
    const col = (
      await db.query(
        "select id from public.board_columns where phase='publication'",
      )
    ).rows[0];
    await expect(
      rpc(db, "operator", "save_part", [
        { id: part.id, column_id: col.id },
        part.version,
      ]),
    ).rejects.toThrow(/pendências/);
  });
  it("denies unauthorized users and read-only mutations", async () => {
    await expect(create("viewer")).rejects.toThrow(/permissão/);
    await expect(create("outsider")).rejects.toThrow(/permissão/);
    const rows = await asUser(db, "outsider", (tx) =>
      tx.query("select * from public.parts"),
    );
    expect(rows.rows).toHaveLength(0);
    await expect(
      asUser(db, "operator", (tx) =>
        tx.exec("update public.parts set title='hack'"),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("restricts company edits and employee management to administrators", async () => {
    await expect(
      rpc(db, "operator", "company_save", [{ trade_name: "Hack" }, 1]),
    ).rejects.toThrow(/administradores/);
    const w = (
      await db.query("select * from public.workspaces where id=$1", [COMPANY])
    ).rows[0];
    const result = await rpc(db, "admin", "company_save", [
      {
        trade_name: "Desmonte Teste",
        fee_percent: 14,
        fee_fixed_cents: 600,
        fee_configured: true,
        preferences: { minimum_photos: 2 },
      },
      w.version,
    ]);
    expect(result.trade_name).toBe("Desmonte Teste");
    await expect(
      rpc(db, "admin", "member_save", [USERS.admin, "viewer", false, "Admin"]),
    ).rejects.toThrow(/administrador ativo/);
  });
  it("preserves every piece when removing the first column", async () => {
    const cols = (
      await db.query("select * from public.board_columns order by position")
    ).rows;
    const { part } = await create("operator", { column_id: cols[0].id });
    await rpc(db, "operator", "column_action", [
      "delete",
      { id: cols[0].id, version: cols[0].version, destination: cols[1].id },
    ]);
    const saved = (
      await db.query("select * from public.parts where id=$1", [part.id])
    ).rows[0];
    expect(saved.column_id).toBe(cols[1].id);
    expect(
      (
        await db.query(
          "select count(*) n from public.parts where column_id is null",
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("creates, renames, recolors and reorders columns", async () => {
    await rpc(db, "operator", "column_action", [
      "create",
      { name: "Conferência", phase: "registration", color: "#123456" },
    ]);
    let col = (
      await db.query(
        "select * from public.board_columns where name='Conferência'",
      )
    ).rows[0];
    await rpc(db, "operator", "column_action", [
      "update",
      {
        id: col.id,
        version: col.version,
        name: "Conferido",
        phase: "registration",
        color: "#abcdef",
      },
    ]);
    const ids = (
      await db.query("select id from public.board_columns order by position")
    ).rows
      .map((c) => c.id)
      .reverse();
    await rpc(db, "operator", "column_action", ["reorder", { ids }]);
    expect(
      (
        await db.query("select id from public.board_columns order by position")
      ).rows.map((c) => c.id),
    ).toEqual(ids);
  });
  it("rejects invalid moves and avoids cross-company access", async () => {
    const { part } = await create();
    await expect(
      rpc(db, "operator", "save_part", [
        { id: part.id, column_id: crypto.randomUUID() },
        part.version,
      ]),
    ).rejects.toThrow(/Etapa inválida/);
  });
  it("uses atomic reservations and blocks duplicate sales", async () => {
    const { part } = await create();
    const payload = { request_id: crypto.randomUUID(), version: part.version };
    const results = await Promise.allSettled([
      rpc(db, "sales", "sale_action", [part.id, "reserve", payload]),
      rpc(db, "sales", "sale_action", [
        part.id,
        "reserve",
        { ...payload, request_id: crypto.randomUUID() },
      ]),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const p = (
      await db.query("select * from public.parts where id=$1", [part.id])
    ).rows[0];
    const sale = await rpc(db, "sales", "sale_action", [
      p.id,
      "sell_local",
      {
        request_id: crypto.randomUUID(),
        version: p.version,
        amount_cents: 12345,
      },
    ]);
    expect(sale.status).toBe("sold");
    const sold = (
      await db.query("select * from public.parts where id=$1", [p.id])
    ).rows[0];
    await expect(
      rpc(db, "sales", "sale_action", [
        p.id,
        "sell_local",
        {
          request_id: crypto.randomUUID(),
          version: sold.version,
          amount_cents: 12345,
        },
      ]),
    ).rejects.toThrow(/já vendida/);
  });
  it("requires real confirmation and order for online sales", async () => {
    const { part } = await create();
    await expect(
      rpc(db, "sales", "sale_action", [
        part.id,
        "sell_online",
        {
          request_id: crypto.randomUUID(),
          version: part.version,
          amount_cents: 100,
        },
      ]),
    ).rejects.toThrow(/confirme/);
  });
  it("records cancellations with reason and restores availability", async () => {
    const { part } = await create();
    await rpc(db, "sales", "sale_action", [
      part.id,
      "sell_local",
      {
        request_id: crypto.randomUUID(),
        version: part.version,
        amount_cents: 10000,
      },
    ]);
    const sold = (
      await db.query("select * from public.parts where id=$1", [part.id])
    ).rows[0];
    await rpc(db, "sales", "sale_action", [
      part.id,
      "cancel",
      {
        request_id: crypto.randomUUID(),
        version: sold.version,
        note: "Cliente desistiu",
      },
    ]);
    expect(
      (
        await db.query("select sale_status from public.parts where id=$1", [
          part.id,
        ])
      ).rows[0].sale_status,
    ).toBe("available");
  });
  it("imports legacy records idempotently without losing the payload", async () => {
    const source = crypto.randomUUID();
    const payload = {
      legacy_source: source,
      legacy_payload: { code: "PTV-1", vehicle: "Gol", condition: "Bom" },
      part_name: "Motor",
    };
    const a = await create("admin", payload),
      b = await create("admin", payload);
    expect(a.part.id).toBe(b.part.id);
    expect(b.part.legacy_payload.code).toBe("PTV-1");
  });
});
