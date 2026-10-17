import { beforeAll, afterAll, it, expect } from "vitest";
import { database, USERS, COMPANY, rpc } from "./helpers/database.js";
import { mapPiece } from "../scripts/lib/desmonte-import.mjs";
import { fees, vehicle, missingFields } from "../src/domain.js";
let db;
const source = (id = "piece-test-1", extras = {}) => ({
  id,
  type: "Porta",
  code: "REPETIDO",
  detran: "SP123",
  brand: "Fiat",
  model: "Palio",
  year: "2000 a 2005",
  position: "Traseira",
  side: "Direita",
  title: "Título antigo",
  price: "",
  feePercent: 12,
  fixedFee: 2,
  otherCost: 3,
  history: [{ action: "Antigo", at: 123 }],
  ...extras,
});
const service = async (command, payload) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return (
      await tx.query("select public.import_desmonte($1,$2,$3) as value", [
        command,
        payload,
        USERS.admin,
      ])
    ).rows[0].value;
  });
const imported = (s, role = "pending") =>
  service("piece", {
    part: mapPiece(s, { role }).payload,
    meta: { role, is_draft: false, issues: [] },
  });
beforeAll(async () => {
  db = await database();
  await service("batch", {
    source_key: "desmonte:pecaflux-local",
    manifest_hash: "test-hash",
    manifest: { backup: "local-test" },
  });
});
afterAll(() => db?.close());
it("imports numeric identities in PostgreSQL, year ranges, missing price and individual fees", async () => {
  const { part } = await imported(source());
  expect(Number(part.internal_number)).toBeGreaterThan(0);
  expect(part.internal_code).not.toBe("REPETIDO");
  expect(part.year).toBeNull();
  expect(part.year_compatibility).toBe("2000 a 2005");
  expect(part.price_cents).toBeNull();
  expect(Number(part.fee_percent_override)).toBe(12);
  expect(part.fee_fixed_cents_override).toBe(200);
  expect(part.other_cost_cents).toBe(300);
  expect(vehicle(part)).toContain("2000 a 2005");
  expect(fees(10000, { fee_percent: 99, fee_configured: true }, part)).toEqual({
    fee: 1400,
    net: 8300,
  });
});
it("replays imports without changes, while changed input produces a preserved conflict", async () => {
  const a = await imported(source());
  const b = await imported(source());
  expect(b.reused).toBe(true);
  expect(a.part.id).toBe(b.part.id);
  await expect(
    imported(source("piece-test-1", { title: "Outro" })),
  ).rejects.toMatchObject({ code: "PT409" });
});
it("keeps distinct pieces even with repeated old code and Detran", async () => {
  const a = await imported(source("piece-test-2"));
  const b = await imported(source("piece-test-3"));
  expect(a.part.id).not.toBe(b.part.id);
  expect(a.part.internal_number).not.toBe(b.part.internal_number);
});
it("preserves unverified legacy publication and makes historical sold pieces unavailable", async () => {
  const pub = await imported(source("piece-test-published"), "published");
  expect(pub.part.listing_status).toBe("legacy_published");
  const sold = await imported(source("piece-test-sold"), "sold");
  expect(sold.part.sale_status).toBe("sold");
  const ledger = (
    await db.query("select * from public.part_sales where part_id=$1", [
      sold.part.id,
    ])
  ).rows[0];
  expect(ledger.channel).toBe("legacy");
  expect(ledger.amount_cents).toBeNull();
  await expect(
    rpc(db, "admin", "sale_action", [
      sold.part.id,
      "reserve",
      { version: sold.part.version, request_id: crypto.randomUUID() },
    ]),
  ).rejects.toThrow(/vendida/);
});
it("does not expose import capabilities or unguarded core functions to staff", async () => {
  await expect(
    rpc(db, "admin", "import_desmonte", ["piece", {}, USERS.admin]),
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select partiva_private.sale_action_core($1,$2,$3)", [
        crypto.randomUUID(),
        "reserve",
        {},
      ]);
    }),
  ).rejects.toThrow(/permission denied/);
});
it("preserves pending and empty drafts idempotently without making duplicate pieces", async () => {
  const input = {
    source_key: "desmonte:pecaflux-local:draft:key1",
    resolution: "pending",
    candidate_sources: ["desmonte:pecaflux-local:piece-test-1"],
    original_payload: { piece: source("piece-draft-other"), savedAt: 123 },
    part_source: null,
  };
  const a = await service("draft", input),
    b = await service("draft", input);
  expect(a.id).toBe(b.id);
  expect(b.reused).toBe(true);
  const row = (
    await db.query("select * from public.legacy_drafts where id=$1", [a.id])
  ).rows[0];
  expect(row.part_id).toBeNull();
  expect(row.original_payload.piece.id).toBe("piece-draft-other");
});
it("preserves standby availability until an administrator explicitly releases it", async () => {
  const { part } = await imported(source("piece-test-hold"), "standby");
  expect(part.legacy_hold).toBe(true);
  await expect(
    rpc(db, "admin", "sale_action", [
      part.id,
      "reserve",
      { request_id: crypto.randomUUID(), version: part.version },
    ]),
  ).rejects.toThrow(/repouso/);
  const released = await rpc(db, "admin", "release_legacy_hold", [
    part.id,
    part.version,
  ]);
  expect(released.legacy_hold).toBe(false);
});
it("keeps per-piece fees during regular editing and flags suggested prices consistently", async () => {
  const { part } = await imported(
    source("piece-test-edit", { price: 199, priceIsSuggested: true }),
  );
  const changed = await rpc(db, "operator", "save_part", [
    { id: part.id, title: "Editado" },
    part.version,
  ]);
  expect(Number(changed.part.fee_percent_override)).toBe(12);
  expect(changed.part.year_compatibility).toBe("2000 a 2005");
  expect(missingFields(changed.part, [], { fee_configured: false })).toContain(
    "Conferir preço sugerido do sistema antigo",
  );
});
