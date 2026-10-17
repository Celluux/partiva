import { missingFields, normalize } from "./domain.js";

export const OPERATIONAL_STAGES = Object.freeze([
  { key: "registration", label: "Cadastro" },
  { key: "photos_pending", label: "Fotografias pendentes" },
  { key: "photos_edited", label: "Fotografias editadas" },
  { key: "listing", label: "Preparação do anúncio" },
  { key: "publication", label: "Pronto para publicação" },
]);

const stageKeys = new Set(OPERATIONAL_STAGES.map((stage) => stage.key));
const commercialListings = new Set(["legacy_published", "published", "paused"]);
const legacyCommercialColumns = new Set([
  "anunciadas (legado)",
  "vendidas (legado)",
  "em repouso (legado)",
]);
const columnName = (column) => normalize(column?.name).replace(/\s+/g, " ");

export function isLegacyPhotoColumn(column) {
  return columnName(column) === "editar fotos (legado)";
}

// These imported columns remain in the database as historical references.
// Their records are presented by current status, without moving or editing them.
export function operationalColumn(column) {
  return (
    !isLegacyPhotoColumn(column) &&
    !legacyCommercialColumns.has(columnName(column))
  );
}

export function isOperationalPiece(piece) {
  return (
    !piece.archived_at &&
    piece.sale_status !== "sold" &&
    !piece.legacy_hold &&
    !commercialListings.has(piece.listing_status)
  );
}

export function operationalPhase(piece, columns = []) {
  if (!isOperationalPiece(piece)) return null;
  const column = columns.find((candidate) => candidate.id === piece.column_id);
  if (isLegacyPhotoColumn(column)) return "photos_pending";
  if (stageKeys.has(column?.phase)) return column.phase;
  if (stageKeys.has(piece.operational_status)) return piece.operational_status;
  const previousStates = {
    entry: "registration",
    dismantling: "registration",
    preparing: "listing",
    ready: "publication",
  };
  return previousStates[piece.operational_status] || "registration";
}

export function presentedColumn(piece, columns = []) {
  const visible = columns.filter(operationalColumn);
  if (visible.some((c) => c.id === piece.column_id)) return piece.column_id;
  return (
    visible.find((c) => c.phase === operationalPhase(piece, columns)) ||
    visible[0]
  )?.id;
}

export function reorderOperationalColumns(columns, id, delta) {
  const visible = columns.filter(operationalColumn);
  const index = visible.findIndex((c) => c.id === id);
  if (![1, -1].includes(delta) || index < 0 || !visible[index + delta])
    throw new Error("Não há outra coluna operacional nessa direção.");
  const ids = columns.map((c) => c.id);
  const from = ids.indexOf(id),
    to = ids.indexOf(visible[index + delta].id);
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids;
}

export function overviewData({
  pieces = [],
  columns = [],
  photos = [],
  company = {},
} = {}) {
  const records = pieces.filter((piece) => !piece.archived_at);
  const photosByPiece = new Map();
  for (const photo of photos) {
    if (photo.archived_at) continue;
    const group = photosByPiece.get(photo.part_id) || [];
    group.push(photo);
    photosByPiece.set(photo.part_id, group);
  }
  const stages = OPERATIONAL_STAGES.map((stage) => ({
    ...stage,
    pieces: [],
    count: 0,
    pendingCount: 0,
  }));
  const stageByKey = new Map(stages.map((stage) => [stage.key, stage]));
  const priorities = [];
  const minimumPhotos = company.preferences?.minimum_photos ?? 2;
  let ready = 0;
  let needsPhotos = 0;

  for (const piece of records) {
    const phase = operationalPhase(piece, columns);
    if (!phase) continue;
    const piecePhotos = photosByPiece.get(piece.id) || [];
    const missing = missingFields(piece, piecePhotos, company);
    const photoCount = new Set(
      piecePhotos.map((photo) => photo.original_photo_id || photo.id),
    ).size;
    const selectedPhotoCount = new Set(
      piecePhotos
        .filter((photo) => photo.selected_for_listing)
        .map((photo) => photo.original_photo_id || photo.id),
    ).size;
    const stage = stageByKey.get(phase);
    stage.pieces.push(piece);
    stage.count += 1;
    if (missing.length) {
      stage.pendingCount += 1;
      priorities.push({
        piece,
        phase,
        missing,
        photoCount,
        selectedPhotoCount,
      });
    }
    if (selectedPhotoCount < minimumPhotos) needsPhotos += 1;
    if (piece.listing_status === "ready") ready += 1;
  }

  // Missing required information determines the queue; older records break ties.
  priorities.sort(
    (a, b) =>
      b.missing.length - a.missing.length ||
      String(a.piece.created_at || "").localeCompare(
        String(b.piece.created_at || ""),
      ) ||
      Number(a.piece.internal_number || 0) -
        Number(b.piece.internal_number || 0),
  );
  const active = stages.reduce((count, stage) => count + stage.count, 0);
  return {
    total: records.length,
    active,
    preparing: active - ready,
    stages,
    historical: records.filter(
      (piece) => piece.listing_status === "legacy_published",
    ).length,
    ready,
    photoPending: stageByKey.get("photos_pending").count,
    needsPhotos,
    reserved: records.filter((piece) => piece.sale_status === "reserved")
      .length,
    sold: records.filter((piece) => piece.sale_status === "sold").length,
    held: records.filter((piece) => piece.legacy_hold).length,
    paused: records.filter((piece) => piece.listing_status === "paused").length,
    published: records.filter((piece) => piece.listing_status === "published")
      .length,
    priorities,
  };
}
