import { beforeAll, afterAll, it, expect } from "vitest";
import { routeView, VIEWS } from "../src/navigation.js";
import { database, rpc } from "./helpers/database.js";
let db;
beforeAll(async () => {
  db = await database();
});
afterAll(async () => {
  await db?.close();
});
it("restores all seven routes and handles unknown and auth hashes", () => {
  for (const view of VIEWS) expect(routeView(`#/${view}`)).toBe(view);
  expect(routeView("#access_token=private")).toBe("board");
  expect(routeView("#/missing")).toBe("board");
});
it("edits a reservation with an audit event, prevents another employee from selling it, and confirms once", async () => {
  const { part: p } = await rpc(db, "operator", "save_part", [
    { part_name: "Motor" },
    null,
  ]);
  const call = (role, command, payload) =>
    rpc(db, role, "sale_action", [
      p.id,
      command,
      { request_id: crypto.randomUUID(), ...payload },
    ]);
  const reserved = await call("sales", "reserve", {
    version: p.version,
    customer: "Cliente teste",
  });
  expect(reserved.reservation.customer).toBe("Cliente teste");
  const current = async () =>
    (await db.query("select * from public.parts where id=$1", [p.id])).rows[0];
  let fresh = await current();
  await db.query(
    "update public.workspace_members set role='sales' where user_id=$1",
    [(await import("./helpers/database.js")).USERS.operator],
  );
  await expect(
    call("operator", "sell_local", {
      version: fresh.version,
      amount_cents: 100,
    }),
  ).rejects.toThrow(/responsável/);
  await expect(
    call("operator", "release", {
      version: fresh.version,
      note: "Cancelamento indevido",
    }),
  ).rejects.toThrow(/responsável/);
  await db.query(
    "update public.workspace_members set role='operator' where user_id=$1",
    [(await import("./helpers/database.js")).USERS.operator],
  );
  await expect(
    call("operator", "sell_local", {
      version: fresh.version,
      amount_cents: 100,
    }),
  ).rejects.toThrow(/permissão/);
  const edited = await call("sales", "edit_reservation", {
    version: fresh.version,
    customer: "Cliente atualizado",
    note: "Retirada amanhã",
  });
  expect(edited.reservation.customer).toBe("Cliente atualizado");
  await expect(
    call("sales", "edit_reservation", { version: fresh.version }),
  ).rejects.toThrow(/Atualize/);
  fresh = await current();
  const sale = await call("sales", "sell_local", {
    version: fresh.version,
    amount_cents: 10000,
  });
  expect(sale.status).toBe("sold");
  fresh = await current();
  await expect(
    call("sales", "sell_local", {
      version: fresh.version,
      amount_cents: 10000,
    }),
  ).rejects.toThrow(/vendida/);
  expect(
    (
      await db.query(
        "select count(*)::int n from public.part_events where part_id=$1 and event_type='reservation_updated'",
        [p.id],
      )
    ).rows[0].n,
  ).toBe(1);
});
