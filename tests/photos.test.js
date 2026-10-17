import { beforeAll, afterAll, it, expect } from "vitest";
import { database, rpc, asUser, COMPANY } from "./helpers/database.js";
let db, part, original, edited;
beforeAll(async () => {
  db = await database();
  part = (
    await rpc(db, "operator", "save_part", [
      { id: crypto.randomUUID(), part_name: "Motor" },
      null,
    ])
  ).part;
});
afterAll(() => db?.close());
async function upload(role = "photographer", parent = null) {
  const id = crypto.randomUUID(),
    path = `${COMPANY}/${part.id}/${id}.jpg`;
  await asUser(db, role, (tx) =>
    tx.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
      "part-photos",
      path,
    ]),
  );
  await rpc(db, role, "photo_action", [
    part.id,
    "register",
    {
      id,
      storage_path: path,
      original_photo_id: parent,
      mime_type: "image/jpeg",
      size_bytes: 1024,
    },
  ]);
  return { id, path };
}
it("uploads original privately and registers real storage objects", async () => {
  original = await upload();
  expect(
    (
      await db.query(
        "select kind,is_cover from public.part_photos where id=$1",
        [original.id],
      )
    ).rows[0],
  ).toEqual({ kind: "original", is_cover: true });
});
it("links edited versions without overwriting originals", async () => {
  edited = await upload("photographer", original.id);
  const p = (
    await db.query("select * from public.part_photos where id=$1", [edited.id])
  ).rows[0];
  expect(p.kind).toBe("edited");
  expect(p.original_photo_id).toBe(original.id);
  expect(p.storage_path).not.toBe(original.path);
});
it("orders photos and changes the cover atomically", async () => {
  await rpc(db, "photographer", "photo_action", [
    part.id,
    "reorder",
    { ids: [edited.id, original.id] },
  ]);
  await rpc(db, "photographer", "photo_action", [
    part.id,
    "cover",
    { id: edited.id },
  ]);
  const photos = (
    await db.query("select * from public.part_photos order by sort_order")
  ).rows;
  expect(photos[0].id).toBe(edited.id);
  expect(photos.filter((p) => p.is_cover)).toHaveLength(1);
});
it("denies overwriting and deleting original bytes with a valid user", async () => {
  const update = await asUser(db, "photographer", (tx) =>
    tx.query(
      "update storage.objects set name='overwrite.jpg' where name=$1 returning id",
      [original.path],
    ),
  );
  expect(update.rows).toHaveLength(0);
  const deleted = await asUser(db, "photographer", (tx) =>
    tx.query("delete from storage.objects where name=$1 returning id", [
      original.path,
    ]),
  );
  expect(deleted.rows).toHaveLength(0);
});
it("protects photo access from unassigned accounts", async () => {
  expect(
    (
      await asUser(db, "outsider", (tx) =>
        tx.query("select * from storage.objects"),
      )
    ).rows,
  ).toHaveLength(0);
  await expect(upload("viewer")).rejects.toThrow(/row-level security/);
  await expect(upload("outsider")).rejects.toThrow(/row-level security/);
});
it("requires an uploaded object and rejects invalid version origins", async () => {
  await expect(
    rpc(db, "photographer", "photo_action", [
      part.id,
      "register",
      {
        id: crypto.randomUUID(),
        storage_path: `${COMPANY}/${part.id}/${crypto.randomUUID()}.jpg`,
        mime_type: "image/jpeg",
        size_bytes: 42,
      },
    ]),
  ).rejects.toThrow(/não confirmado/);
  await expect(upload("photographer", crypto.randomUUID())).rejects.toThrow(
    /original inválida/,
  );
});
it("controls removals while preserving history and original files", async () => {
  await expect(
    rpc(db, "photographer", "photo_action", [
      part.id,
      "archive",
      { id: original.id },
    ]),
  ).rejects.toThrow(/versões editadas/);
  await rpc(db, "photographer", "photo_action", [
    part.id,
    "archive",
    { id: edited.id },
  ]);
  await rpc(db, "photographer", "photo_action", [
    part.id,
    "archive",
    { id: original.id },
  ]);
  expect(
    (
      await db.query("select count(*) n from storage.objects where name=$1", [
        original.path,
      ])
    ).rows[0].n,
  ).toBe(1);
  expect(
    (
      await db.query(
        "select count(*) n from public.part_events where part_id=$1",
        [part.id],
      )
    ).rows[0].n,
  ).toBeGreaterThan(2);
});
