import { it, expect } from "vitest";
import { database, asUser, COMPANY } from "./helpers/database.js";
it("upgrades existing records and legacy photo paths without data destruction", async () => {
  const pid = crypto.randomUUID();
  const db = await database(async (db) => {
    await db.query(
      "insert into public.parts(id,workspace_id,internal_code,title,vehicle,stock_location,condition,notes) values($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        pid,
        COMPANY,
        "PTV-1042",
        "Motor original",
        "Fiat Argo 2020",
        "A4",
        "Bom",
        "Anotação existente",
      ],
    );
    await db.query(
      "insert into storage.objects(bucket_id,name) values($1,$2)",
      ["part-photos", "legacy/original.jpg"],
    );
    await db.query(
      "insert into public.part_photos(part_id,storage_path) values($1,$2)",
      [pid, "legacy/original.jpg"],
    );
  });
  try {
    const row = (
      await db.query("select * from public.parts where id=$1", [pid])
    ).rows[0];
    expect(row.internal_code).toBe("PTV-1042");
    expect(row.vehicle).toBe("Fiat Argo 2020");
    expect(row.stock_location).toBe("A4");
    expect(row.condition).toBe("Bom");
    expect(row.notes).toBe("Anotação existente");
    expect(row.column_id).toBeTruthy();
    expect(row.internal_number).toBeTruthy();
    const files = await asUser(db, "operator", (tx) =>
      tx.query(
        "select * from storage.objects where name='legacy/original.jpg'",
      ),
    );
    expect(files.rows).toHaveLength(1);
  } finally {
    await db.close();
  }
});
