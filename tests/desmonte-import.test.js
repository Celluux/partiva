import { it, expect } from "vitest";
import {
  mapPiece,
  sourceKey,
  repeatedGroups,
  meaningfulDraft,
} from "../scripts/lib/desmonte-import.mjs";
const piece = {
  id: "old-1",
  type: "Porta",
  code: "D001",
  detran: "SP001",
  brand: "Fiat",
  model: "Palio",
  year: "2001 a 2005",
  side: "Direita",
  position: "Traseira",
  title: "Título original",
  price: 123.45,
  images: [],
  history: [{ action: "created", at: 123 }],
  unknownFutureField: { keep: true },
};
it("keeps stable provenance independent of titles and mutable old codes", () => {
  expect(sourceKey(piece)).toBe(
    sourceKey({ ...piece, title: "Alterado", code: "D999" }),
  );
  expect(sourceKey({ ...piece, id: "old-2" })).not.toBe(sourceKey(piece));
  expect(() => sourceKey({})).toThrow(/ausente/);
});
it("never assigns a permanent internal identifier or copies the old code into it", () => {
  const { payload } = mapPiece(piece);
  expect(payload).not.toHaveProperty("internal_number");
  expect(payload).not.toHaveProperty("internal_code");
  expect(payload).not.toHaveProperty("id");
  expect(payload.complementary_code).toBe("D001");
});
it("preserves the entire source including unknown fields and history without modifying it", () => {
  const before = structuredClone(piece);
  const p = mapPiece(piece);
  expect(p.payload.legacy_payload.piece).toEqual(before);
  expect(piece).toEqual(before);
  expect(p.unknownFields).toEqual(["unknownFutureField"]);
});
it("normalizes side and price while preserving ambiguous compatibility and missing values", () => {
  const p = mapPiece(piece);
  expect(p.payload.side).toBe("Direito");
  expect(p.payload.year).toBeNull();
  expect(p.payload.price_cents).toBe(12345);
  expect(p.payload.vehicle).toContain("2001 a 2005");
  expect(mapPiece({ ...piece, year: "2001", price: "" }).payload).toMatchObject(
    { year: 2001, price_cents: null },
  );
});
it("is deterministic when repeated and retains photo links and pending drafts", () => {
  const options = {
    photos: [{ sha256: "abc", slot: 0 }],
    drafts: [{ piece: { id: piece.id, notes: "pendente" } }],
  };
  const a = mapPiece(piece, options),
    b = mapPiece(structuredClone(piece), structuredClone(options));
  expect(a).toEqual(b);
  expect(a.payload.legacy_payload.photos).toEqual(options.photos);
  expect(a.payload.legacy_payload.drafts).toEqual(options.drafts);
});
it("flags legacy publications and sales without forging publication or sales fields", () => {
  const p = mapPiece(piece, { role: "sold" });
  expect(p.requires_state_reconciliation).toBe(true);
  expect(p.warnings).toContain("legacy_sale_must_block_availability");
  expect(p.payload).not.toHaveProperty("sale_status");
  expect(mapPiece(piece, { role: "published" }).warnings).toContain(
    "legacy_publication_unverified",
  );
  expect(p.payload).not.toHaveProperty("listing_status");
});
it("reports repeated references but does not merge separate source identifiers", () => {
  const group = repeatedGroups([piece, { ...piece, id: "old-2" }], "code");
  expect(group).toEqual([{ value: "d001", ids: ["old-1", "old-2"] }]);
  expect(mapPiece(piece).legacy_source).not.toBe(
    mapPiece({ ...piece, id: "old-2" }).legacy_source,
  );
});
it("distinguishes a meaningful partial draft from an empty editor record", () => {
  expect(
    meaningfulDraft({
      id: "blank",
      isDraft: true,
      images: [null, null],
      price: "",
    }),
  ).toBe(false);
  expect(meaningfulDraft({ id: "partial", type: "Porta", price: "" })).toBe(
    true,
  );
});
