import { createHash } from "node:crypto";
export const SOURCE_NAMESPACE = "desmonte:pecaflux-local";
const hash = (value) => createHash("sha256").update(value).digest("hex");
export function sourceKey(piece) {
  if (!piece.id || typeof piece.id !== "string")
    throw new Error("Identificador antigo ausente. Exige revisão.");
  return `${SOURCE_NAMESPACE}:${piece.id}`;
}
export function mapPiece(
  piece,
  { role = "pending", photos = [], drafts = [] } = {},
) {
  const warnings = [];
  const yearText = String(piece.year || "").trim();
  const year =
    /^\d{4}$/.test(yearText) && +yearText >= 1900 && +yearText <= 2200
      ? +yearText
      : null;
  if (yearText && year === null) warnings.push("year_compatibility_text");
  const side = {
    Direita: "Direito",
    Esquerda: "Esquerdo",
    Direito: "Direito",
    Esquerdo: "Esquerdo",
    "": "",
  }[piece.side || ""];
  if (side === undefined) warnings.push("side_needs_review");
  const rawPrice = piece.price;
  const price =
    rawPrice === "" || rawPrice == null
      ? null
      : Number(String(rawPrice).replace(",", "."));
  if (
    price !== null &&
    (!Number.isFinite(price) || price < 0 || price * 100 > 2147483647)
  )
    warnings.push("price_invalid");
  if (piece.priceIsSuggested) warnings.push("price_is_suggested");
  if (role === "published") warnings.push("legacy_publication_unverified");
  if (role === "sold") warnings.push("legacy_sale_must_block_availability");
  if (["standby", "archived", "none"].includes(role))
    warnings.push("legacy_operational_state");
  if (!piece.detran || /^sem\s+info/i.test(piece.detran))
    warnings.push("detran_missing_or_placeholder");
  const known = [
    "id",
    "boardId",
    "columnId",
    "detran",
    "code",
    "type",
    "brand",
    "model",
    "year",
    "position",
    "side",
    "color",
    "title",
    "titleManual",
    "price",
    "feePercent",
    "fixedFee",
    "otherCost",
    "observations",
    "description",
    "descriptionManual",
    "mlItemId",
    "mlUrl",
    "images",
    "ignoredFields",
    "history",
    "createdAt",
    "updatedAt",
    "isDraft",
    "priceIsSuggested",
    "priceSource",
  ];
  const unknownFields = Object.keys(piece).filter((k) => !known.includes(k));
  const original = structuredClone(piece);
  const preservePhoto = ({ source_copy, ...metadata }) =>
    structuredClone(metadata);
  const legacyPayload = {
    format: "pecaflux-local/v1",
    piece: original,
    role,
    photos: photos.map(preservePhoto),
    drafts: drafts.map(({ photos: draftPhotos, ...draft }) => ({
      ...structuredClone(draft),
      ...(draftPhotos ? { photos: draftPhotos.map(preservePhoto) } : {}),
    })),
  };
  const notes = [
    piece.observations,
    piece.description
      ? `Descrição do anúncio no sistema antigo:\n${piece.description}`
      : "",
    yearText && year === null
      ? `Ano / compatibilidade original: ${yearText}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  if (notes.length > 5000) warnings.push("notes_exceed_current_limit");
  const payload = {
    legacy_source: sourceKey(piece),
    legacy_payload: legacyPayload,
    complementary_code: String(piece.code || ""),
    detran_reference: String(piece.detran || ""),
    part_name: String(piece.type || ""),
    category: String(piece.type || ""),
    brand: String(piece.brand || ""),
    model: String(piece.model || ""),
    year,
    position: String(piece.position || ""),
    side: side ?? "",
    color: String(piece.color || ""),
    title: String(piece.title || ""),
    title_manual: Boolean(piece.title),
    price_cents:
      price !== null &&
      Number.isFinite(price) &&
      price >= 0 &&
      price * 100 <= 2147483647
        ? Math.round(price * 100)
        : null,
    notes,
    vehicle: [piece.brand, piece.model, yearText].filter(Boolean).join(" "),
  };
  for (const [key, value] of Object.entries(payload))
    if (
      typeof value === "string" &&
      key !== "notes" &&
      key !== "vehicle" &&
      value.length > 250
    )
      warnings.push(`field_too_long:${key}`);
  return {
    legacy_source: payload.legacy_source,
    fingerprint: hash(JSON.stringify(legacyPayload)),
    payload,
    warnings,
    unknownFields,
    operational_target:
      {
        pending: "registration",
        incomplete: "photos_pending",
        "editing-photos": "photos_pending",
        ready: "listing",
        published: "publication",
        sold: "registration",
        standby: "registration",
        archived: "registration",
      }[role] || "registration",
    requires_state_reconciliation: [
      "sold",
      "published",
      "standby",
      "archived",
      "ready",
    ].includes(role),
  };
}
export function repeatedGroups(
  pieces,
  field,
  { ignorePlaceholders = false } = {},
) {
  const groups = new Map();
  for (const p of pieces) {
    const key = String(p[field] ?? "")
      .trim()
      .toLowerCase();
    if (!key || (ignorePlaceholders && /^sem\s+info$/.test(key))) continue;
    groups.set(key, [...(groups.get(key) || []), p.id]);
  }
  return [...groups]
    .filter(([, ids]) => ids.length > 1)
    .map(([value, ids]) => ({ value, ids }));
}
export function meaningfulDraft(piece) {
  return (
    [
      "detran",
      "code",
      "type",
      "brand",
      "model",
      "year",
      "position",
      "side",
      "color",
      "title",
      "observations",
      "description",
      "mlItemId",
      "mlUrl",
    ].some((k) => String(piece[k] || "").trim()) ||
    (piece.price !== "" && piece.price != null) ||
    (piece.images || []).some(Boolean)
  );
}
