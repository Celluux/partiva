// Read-only remote verification. No Auth, table, Storage or schema mutations.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { serviceAccess, checked, PROJECT } from "./lib/partivaa-service.mjs";
import { overviewData } from "../src/overview-data.js";
const client = serviceAccess();
const tables = [
  "parts",
  "part_photos",
  "part_sales",
  "part_events",
  "board_columns",
  "workspaces",
  "legacy_drafts",
  "workspace_members",
  "company_events",
];
const snapshot = {};
for (const table of tables) {
  const rows = [];
  for (let page = 0; ; page++) {
    const batch = checked(
      await client
        .from(table)
        .select("*")
        .order(table === "workspace_members" ? "user_id" : "id")
        .range(page * 1000, (page + 1) * 1000 - 1),
    );
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  snapshot[table] = rows;
}
const summary = overviewData({
  pieces: snapshot.parts,
  photos: snapshot.part_photos,
  columns: snapshot.board_columns,
  company: snapshot.workspaces.find((w) => w.active) || snapshot.workspaces[0],
});
const report = {
  project: PROJECT,
  checked_at: new Date().toISOString(),
  readonly: true,
  metrics: {
    total: summary.total,
    active: summary.active,
    photoPending: summary.photoPending,
    ready: summary.ready,
    historical: summary.historical,
    reserved: summary.reserved,
    sold: summary.sold,
    held: summary.held,
  },
  stages: summary.stages.map(({ key, count, pendingCount }) => ({
    key,
    count,
    pendingCount,
  })),
  tables: Object.fromEntries(
    tables.map((t) => [
      t,
      {
        rows: snapshot[t].length,
        sha256: createHash("sha256")
          .update(JSON.stringify(snapshot[t]))
          .digest("hex"),
      },
    ]),
  ),
};
const directory = "artifacts/private/overview-validation";
await mkdir(directory, { recursive: true });
const baselinePath = `${directory}/remote-before.json`;
if (process.argv.includes("--before")) {
  try {
    await readFile(baselinePath);
    throw new Error("A verificação inicial já existe; não sobrescrever.");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  await writeFile(baselinePath, JSON.stringify(report, null, 2));
} else {
  const before = JSON.parse(await readFile(baselinePath, "utf8"));
  assert.equal(before.project, PROJECT);
  assert.deepEqual(
    report.tables,
    before.tables,
    "O banco mudou desde a verificação inicial; conferir antes de afirmar preservação.",
  );
  report.remote_unchanged = true;
  await writeFile(
    `${directory}/remote-after.json`,
    JSON.stringify(report, null, 2),
  );
}
console.log(
  JSON.stringify({
    project: PROJECT,
    metrics: report.metrics,
    stages: report.stages,
    readonly: true,
    unchanged: report.remote_unchanged || null,
  }),
);
