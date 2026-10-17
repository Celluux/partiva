import { readFile, writeFile } from "node:fs/promises";
import {
  mapPiece,
  repeatedGroups,
  meaningfulDraft,
} from "./lib/desmonte-import.mjs";
const directory = "artifacts/private/import-analysis";
const read = async (name) =>
  JSON.parse(
    (await readFile(`${directory}/${name}`, "utf8")).replace(/^\uFEFF/, ""),
  );
const records = await read("decoded-state.json"),
  photos = await read("photo-manifest.json"),
  destination = (await read("partivaa-current.json")).rows[0].inventory;
const main = records.find((r) => r.key === "main").value.data,
  pieces = main.pieces;
const ids = new Set(pieces.map((p) => p.id));
if (ids.size !== pieces.length)
  throw new Error(
    "IDs antigos duplicados: revisar antes de preparar importação.",
  );
const drafts = records.filter((r) => r.store_id === 2),
  extraDrafts = drafts.filter((r) => !ids.has(r.value.piece.id));
const columns = main.boards.flatMap((b) => b.columns),
  role = (p) => columns.find((c) => c.id === p.columnId)?.role || "none";
const context = (p) => ({
  role: role(p),
  photos: photos.filter((x) => x.piece_id === p.id && x.record_key === "main"),
  drafts: drafts
    .filter((d) => d.value.piece.id === p.id)
    .map((d) => ({
      ...d.value,
      photos: photos.filter((x) => x.record_key === d.key),
    })),
});
const plans = pieces.map((p) => mapPiece(p, context(p)));
const draftPlans = extraDrafts
  .filter((r) => meaningfulDraft(r.value.piece))
  .map((r) =>
    mapPiece(r.value.piece, {
      role: role(r.value.piece),
      drafts: [r.value],
      photos: photos.filter((x) => x.record_key === r.key),
    }),
  );
const existingKeys = new Set(
  destination.parts.map((p) => p.legacy_source).filter(Boolean),
);
const tally = (values) =>
  Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((v) => [v, values.filter((x) => x === v).length]),
  );
const photoMain = photos.filter((x) => x.record_key === "main");
const summary = {
  mode: "preview_only",
  writes_to_source: false,
  writes_to_supabase: false,
  project: "twtldgdceidyurinrvsy",
  saved_pieces: pieces.length,
  pieces_with_photos: pieces.filter((p) => (p.images || []).some(Boolean))
    .length,
  photo_links: photoMain.length,
  photo_unique_contents: new Set(photoMain.map((p) => p.sha256)).size,
  photo_bytes: photoMain.reduce((sum, p) => sum + p.size, 0),
  draft_photo_links: photos.length - photoMain.length,
  drafts: drafts.length,
  drafts_of_existing: drafts.length - extraDrafts.length,
  new_meaningful_drafts: draftPlans.length,
  empty_drafts_preserved: extraDrafts.filter(
    (r) => !meaningfulDraft(r.value.piece),
  ).length,
  candidates: plans.length + draftPlans.length,
  draft_candidate_matches: draftPlans.map(({ payload: draft }) => ({
    draft_id: draft.legacy_payload.piece.id,
    matches: plans
      .filter(
        ({ payload: piece }) =>
          (draft.title &&
            piece.title.toLowerCase() === draft.title.toLowerCase()) ||
          (draft.complementary_code &&
            piece.complementary_code.toLowerCase() ===
              draft.complementary_code.toLowerCase()) ||
          (draft.detran_reference &&
            !/^sem\s+info$/i.test(draft.detran_reference) &&
            piece.detran_reference.toLowerCase() ===
              draft.detran_reference.toLowerCase()),
      )
      .map((p) => p.payload.legacy_payload.piece.id),
  })),
  already_imported: [...plans, ...draftPlans].filter((p) =>
    existingKeys.has(p.legacy_source),
  ).length,
  target_existing_pieces: destination.parts.length,
  target_active_pieces: destination.parts.filter((p) => !p.archived_at).length,
  stages: tally(pieces.map(role)),
  types: tally(pieces.map((p) => p.type)),
  fees: tally(pieces.map((p) => p.feePercent)),
  duplicate_codes: repeatedGroups(pieces, "code"),
  duplicate_detran: repeatedGroups(pieces, "detran", {
    ignorePlaceholders: true,
  }),
  placeholder_detran: pieces.filter((p) => /^sem\s+info$/i.test(p.detran || ""))
    .length,
  missing_detran: pieces.filter((p) => !p.detran).length,
  missing_prices: pieces.filter((p) => p.price === "" || p.price == null)
    .length,
  suggested_prices: pieces.filter((p) => p.priceIsSuggested).length,
  year_ranges: plans.filter((p) =>
    p.warnings.includes("year_compatibility_text"),
  ).length,
  missing_year: pieces.filter((p) => !p.year).length,
  side_normalizations: pieces.filter((p) =>
    ["Direita", "Esquerda"].includes(p.side),
  ).length,
  histories_preserved: pieces.reduce((n, p) => n + (p.history || []).length, 0),
  warnings: tally(plans.flatMap((p) => p.warnings)),
  target_reference_matches: pieces.flatMap((p) =>
    destination.parts
      .filter(
        (d) =>
          (p.code &&
            String(d.complementary_code).toLowerCase() ===
              p.code.toLowerCase()) ||
          (p.detran && d.detran_reference === p.detran),
      )
      .map((d) => ({ source_id: p.id, target_id: d.id })),
  ),
};
await writeFile(
  `${directory}/import-preview.json`,
  JSON.stringify(
    {
      summary,
      plans,
      draftPlans,
      preservedEmptyDrafts: extraDrafts.filter(
        (r) => !meaningfulDraft(r.value.piece),
      ),
      companySettings: main.settings,
      legacyBoards: main.boards,
    },
    null,
    2,
  ),
);
const escape = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
const csv = [
  [
    "Origem",
    "ID antigo",
    "Código antigo",
    "Detran",
    "Peça",
    "Marca",
    "Modelo",
    "Ano original",
    "Preço original",
    "Etapa antiga",
    "Fotos",
    "Pendências",
  ],
  ...plans.map((p) => {
    const x = p.payload.legacy_payload.piece;
    return [
      "cadastro",
      x.id,
      x.code,
      x.detran,
      x.type,
      x.brand,
      x.model,
      x.year,
      x.price,
      p.payload.legacy_payload.role,
      p.payload.legacy_payload.photos.length,
      p.warnings.join("; "),
    ];
  }),
  ...draftPlans.map((p) => {
    const x = p.payload.legacy_payload.piece;
    return [
      "rascunho",
      x.id,
      x.code,
      x.detran,
      x.type,
      x.brand,
      x.model,
      x.year,
      x.price,
      p.payload.legacy_payload.role,
      0,
      p.warnings.join("; "),
    ];
  }),
]
  .map((row) => row.map(escape).join(";"))
  .join("\r\n");
await writeFile(`${directory}/previa-pecas.csv`, "\uFEFF" + csv);
console.log(JSON.stringify(summary, null, 2));
