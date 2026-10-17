import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  serviceAccess,
  checked,
  sqlRead,
  PROJECT,
} from "./lib/partivaa-service.mjs";
const directory = "artifacts/private/desmonte-migration",
  plan = JSON.parse(await readFile(`${directory}/import-plan.json`, "utf8"));
const root = serviceAccess();
const parts = checked(await root.from("parts").select("*")),
  photos = checked(
    await root
      .from("part_photos")
      .select("*")
      .not("legacy_photo_key", "is", null),
  ),
  drafts = checked(await root.from("legacy_drafts").select("*"));
const imported = parts.filter((p) =>
  p.legacy_source?.startsWith("desmonte:pecaflux-local:"),
);
assert.equal(imported.length, plan.pieces.length);
assert.equal(photos.length, 48);
assert.equal(drafts.length, 8);
let comparisons = 0;
for (const planned of plan.pieces) {
  const p = imported.find(
    (p) => p.legacy_source === planned.part.legacy_source,
  );
  assert(p);
  assert.deepStrictEqual(p.legacy_payload, planned.part.legacy_payload);
  for (const key of [
    "part_name",
    "detran_reference",
    "complementary_code",
    "brand",
    "model",
    "year",
    "position",
    "side",
    "color",
    "title",
    "price_cents",
    "notes",
    "vehicle",
  ])
    assert.deepStrictEqual(
      p[key],
      planned.part[key],
      `Campo divergente ${p.legacy_source}:${key}`,
    );
  const raw = planned.part.legacy_payload.piece;
  assert.equal(p.year_compatibility, raw.year || "");
  assert.equal(Number(p.fee_percent_override), Number(raw.feePercent));
  assert.equal(
    p.fee_fixed_cents_override,
    Math.round(Number(raw.fixedFee || 0) * 100),
  );
  assert.equal(
    p.other_cost_cents,
    Math.round(Number(raw.otherCost || 0) * 100),
  );
  comparisons++;
}
assert.equal(
  imported.filter((p) => p.listing_status === "legacy_published").length,
  57,
);
assert.equal(
  imported.filter((p) => p.listing_status === "published").length,
  0,
);
assert.equal(imported.filter((p) => p.sale_status === "sold").length, 1);
assert.equal(imported.filter((p) => p.legacy_hold).length, 3);
assert.equal(
  imported.filter((p) => !p.legacy_is_draft && p.price_cents === null).length,
  78,
);
assert.equal(imported.filter((p) => p.price_is_suggested).length, 12);
const saved = imported.filter((p) => !p.legacy_is_draft);
const fees = Object.fromEntries(
  [12, 14, 17].map((f) => [
    f,
    saved.filter((p) => Number(p.fee_percent_override) === f).length,
  ]),
);
assert.deepStrictEqual(fees, { 12: 162, 14: 27, 17: 11 });
const sold = imported.find((p) => p.sale_status === "sold"),
  sales = checked(
    await root.from("part_sales").select("*").eq("part_id", sold.id),
  );
assert.equal(sales.length, 1);
assert.equal(sales[0].channel, "legacy");
assert.equal(sales[0].amount_cents, null);
assert.equal(new Set(parts.map((p) => p.internal_number)).size, parts.length);
assert(
  parts.every(
    (p) =>
      Number.isSafeInteger(p.internal_number) &&
      p.internal_number > 0 &&
      p.internal_code === String(p.internal_number),
  ),
);
const ledger = sqlRead(
  "select count(*)::integer as matched from public.parts p join partiva_private.identifiers i on i.part_id=p.id and i.number=p.internal_number where p.legacy_source like 'desmonte:pecaflux-local:%'",
)[0].matched;
assert.equal(ledger, 201);
const photoManifest = JSON.parse(
  await readFile(
    "artifacts/private/import-analysis/photo-manifest.json",
    "utf8",
  ),
);
let imageBytesVerified = 0;
const decoded = JSON.parse(
  await readFile(
    "artifacts/private/import-analysis/decoded-state.json",
    "utf8",
  ),
);
for (const f of photoManifest) {
  const p = imported.find((p) => p.legacy_payload.piece.id === f.piece_id);
  const photo = photos.find(
    (p) =>
      p.legacy_photo_metadata.record_key === f.record_key &&
      p.legacy_photo_metadata.piece_id === f.piece_id &&
      p.legacy_photo_metadata.slot === f.slot,
  );
  assert(photo);
  assert.equal(photo.part_id, p.id);
  assert.equal(photo.kind, "original");
  assert.equal(photo.selected_for_listing, f.record_key === "main");
  const bytes = Buffer.from(
    await checked(
      await root.storage.from("part-photos").download(photo.storage_path),
    ).arrayBuffer(),
  );
  assert.equal(createHash("sha256").update(bytes).digest("hex"), f.sha256);
  imageBytesVerified++;
  const record = decoded.find((r) => r.key === f.record_key),
    original =
      record.key === "main"
        ? record.value.data.pieces.find((x) => x.id === f.piece_id)
        : record.value.piece;
  const entry = record.blob_entries.entries[original.images[f.slot].index];
  const metadata = {
    ...photo.legacy_photo_metadata,
    original_file_metadata: entry,
    original_file_index: original.images[f.slot].index,
  };
  if (process.argv.includes("--complete-file-metadata")) {
    checked(
      await root
        .from("part_photos")
        .update({ legacy_photo_metadata: metadata })
        .eq("id", photo.id),
    );
  } else {
    assert.deepStrictEqual(
      photo.legacy_photo_metadata.original_file_metadata,
      entry,
    );
    assert.equal(
      photo.legacy_photo_metadata.original_file_index,
      original.images[f.slot].index,
    );
  }
  if (imageBytesVerified % 12 === 0)
    console.log(`Hashes e vínculos conferidos: ${imageBytesVerified}/48`);
}
const backup = JSON.parse(
  await readFile(`${directory}/backup-before-import/database.json`, "utf8"),
);
for (const original of backup["public.parts"]) {
  const current = parts.find((p) => p.id === original.id);
  assert(current);
  for (const [k, v] of Object.entries(original)) {
    if (k.endsWith("_at") && v != null)
      assert.equal(new Date(current[k]).getTime(), new Date(v).getTime());
    else
      assert.deepStrictEqual(current[k], v, `Registro prévio alterado: ${k}`);
  }
}
const company = checked(await root.from("workspaces").select("*"));
for (const b of backup["public.workspaces"]) {
  const c = company.find((c) => c.id === b.id);
  for (const [k, v] of Object.entries(b))
    if (!k.endsWith("_at"))
      assert.deepStrictEqual(c[k], v, `Empresa alterada: ${k}`);
}
const snapshot = JSON.parse(
  await readFile(
    "artifacts/private/import-analysis/source-manifest.json",
    "utf8",
  ),
);
let sourceUnchanged = 0;
for (const f of snapshot) {
  const bytes = await readFile(f.source);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), f.sha256);
  sourceUnchanged++;
}
const summary = {
  project: PROJECT,
  checked_at: new Date().toISOString(),
  saved_pieces: 200,
  new_draft_pieces: 1,
  total_imported: imported.length,
  photos: photos.length,
  original_photo_bytes_verified: imageBytesVerified,
  draft_photos: photos.filter((p) => p.legacy_photo_metadata.draft_pending)
    .length,
  drafts: drafts.length,
  draft_resolutions: Object.fromEntries(
    ["same_id", "new_piece", "pending", "empty"].map((x) => [
      x,
      drafts.filter((d) => d.resolution === x).length,
    ]),
  ),
  preserved_historical_publications: 57,
  api_confirmed_publications: 0,
  legacy_sold: 1,
  legacy_standby: 3,
  missing_prices_preserved: 78,
  individual_fees: fees,
  identifiers_matched: ledger,
  source_files_unchanged: sourceUnchanged,
  preexisting_parts_unchanged: backup["public.parts"].length,
  all_fields_compared: comparisons,
  errors: [],
};
await writeFile(
  `${directory}/validation.json`,
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
