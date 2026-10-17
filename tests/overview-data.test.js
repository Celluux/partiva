import { describe, expect, it } from "vitest";
import {
  OPERATIONAL_STAGES,
  isLegacyPhotoColumn,
  isOperationalPiece,
  operationalColumn,
  operationalPhase,
  presentedColumn,
  reorderOperationalColumns,
  overviewData,
} from "../src/overview-data.js";

const columns = OPERATIONAL_STAGES.map((stage) => ({
  id: stage.key,
  phase: stage.key,
  name: stage.label,
}));
const company = { fee_configured: true, preferences: { minimum_photos: 2 } };
const piece = (id, overrides = {}) => ({
  id,
  internal_number: id,
  column_id: "registration",
  sale_status: "available",
  listing_status: "draft",
  part_name: "Motor",
  detran_reference: `D${id}`,
  category: "Mecânica",
  brand: "Fiat",
  model: "Argo",
  year: 2020,
  title: "Motor Fiat Argo 2020",
  price_cents: 10000,
  ...overrides,
});
const photoPair = (part_id) => [
  { id: `${part_id}-a`, part_id, selected_for_listing: true },
  { id: `${part_id}-b`, part_id, selected_for_listing: true },
];

describe("Overview metrics and operational presentation", () => {
  it("keeps the five workflow stages separate from commercial statuses", () => {
    expect(OPERATIONAL_STAGES.map((stage) => stage.key)).toEqual([
      "registration",
      "photos_pending",
      "photos_edited",
      "listing",
      "publication",
    ]);
    expect(OPERATIONAL_STAGES.at(-1).label).toBe("Pronto para publicação");
    const result = overviewData({
      pieces: [
        piece(1),
        piece(2, { listing_status: "legacy_published" }),
        piece(3, { sale_status: "sold" }),
        piece(4, { legacy_hold: true }),
        piece(5, { listing_status: "paused" }),
        piece(6, { listing_status: "published" }),
        piece(7, { sale_status: "reserved", column_id: "photos_pending" }),
        piece(8, { archived_at: "2026-10-17" }),
      ],
      columns,
      company,
    });
    expect(result).toMatchObject({
      total: 7,
      active: 2,
      preparing: 2,
      historical: 1,
      sold: 1,
      reserved: 1,
      held: 1,
      paused: 1,
      published: 1,
      photoPending: 1,
      ready: 0,
    });
    expect(result.stages.reduce((total, stage) => total + stage.count, 0)).toBe(
      result.active,
    );
    expect(result.priorities.map((entry) => entry.piece.id)).toEqual([1, 7]);
  });

  it("honors the current custom column phase after a move or rename", () => {
    const customColumns = [
      { id: "custom", name: "Fila da bancada", phase: "photos_edited" },
    ];
    const record = piece(1, {
      column_id: "custom",
      operational_status: "registration",
      legacy_origin_stage: "editing-photos",
    });
    expect(operationalPhase(record, customColumns)).toBe("photos_edited");
    expect(operationalColumn(customColumns[0])).toBe(true);
    expect(operationalPhase({ ...record, column_id: "listing" }, columns)).toBe(
      "listing",
    );
    const before = overviewData({ pieces: [record], columns: customColumns });
    const after = overviewData({
      pieces: [{ ...record, column_id: "publication" }],
      columns,
    });
    expect(
      before.stages.find((stage) => stage.key === "photos_edited").count,
    ).toBe(1);
    expect(
      after.stages.find((stage) => stage.key === "photos_edited").count,
    ).toBe(0);
    expect(
      after.stages.find((stage) => stage.key === "publication").count,
    ).toBe(1);
    expect(after.ready).toBe(0);
  });

  it("groups imported photo-editing records into photos pending without altering them", () => {
    const oldColumns = [
      {
        id: "old-photo",
        name: " EDITAR  FOTOS (LEGADO) ",
        phase: "registration",
      },
      { id: "old-ad", name: "Anunciadas (legado)", phase: "registration" },
      { id: "old-sale", name: "Vendidas (legado)", phase: "registration" },
      { id: "old-hold", name: "Em repouso (legado)", phase: "registration" },
    ];
    const record = Object.freeze(piece(1, { column_id: "old-photo" }));
    expect(isLegacyPhotoColumn(oldColumns[0])).toBe(true);
    expect(oldColumns.every((column) => !operationalColumn(column))).toBe(true);
    expect(operationalPhase(record, oldColumns)).toBe("photos_pending");
    const result = overviewData({ pieces: [record], columns: oldColumns });
    expect(result.photoPending).toBe(1);
    expect(record.column_id).toBe("old-photo");
    expect(
      operationalColumn({ name: "Revisar fotografias", phase: "listing" }),
    ).toBe(true);
  });

  it("counts real required information and distinct photo roots, including edits", () => {
    const first = piece(1, { column_id: "photos_pending" });
    const second = piece(2, {
      column_id: "publication",
      listing_status: "ready",
    });
    const result = overviewData({
      pieces: [first, second],
      photos: [
        { id: "a", part_id: 1, selected_for_listing: true },
        {
          id: "edited-a",
          part_id: 1,
          original_photo_id: "a",
          selected_for_listing: true,
        },
        {
          id: "b",
          part_id: 1,
          selected_for_listing: true,
          archived_at: "2026-10-17",
        },
        ...photoPair(2),
      ],
      columns,
      company,
    });
    expect(result).toMatchObject({
      active: 2,
      preparing: 1,
      ready: 1,
      needsPhotos: 1,
    });
    expect(
      result.stages.find((stage) => stage.key === "photos_pending"),
    ).toMatchObject({ count: 1, pendingCount: 1 });
    expect(
      result.stages.find((stage) => stage.key === "publication"),
    ).toMatchObject({ count: 1, pendingCount: 0 });
    expect(result.priorities).toHaveLength(1);
    expect(result.priorities[0]).toMatchObject({
      photoCount: 1,
      selectedPhotoCount: 1,
      missing: ["Selecionar ao menos 2 fotografias para anúncio"],
    });
  });

  it("does not turn a sold, paused, held or historical ready piece into preparation", () => {
    const examples = [
      piece(1, { listing_status: "ready", sale_status: "sold" }),
      piece(2, { listing_status: "ready", legacy_hold: true }),
      piece(3, { listing_status: "legacy_published" }),
      piece(4, { listing_status: "paused" }),
      piece(5, { archived_at: "2026-10-17" }),
    ];
    expect(examples.every((record) => !isOperationalPiece(record))).toBe(true);
    expect(
      examples.every((record) => operationalPhase(record, columns) === null),
    ).toBe(true);
    expect(overviewData({ pieces: examples, columns }).ready).toBe(0);
  });

  it("handles empty datasets and falls back without losing a custom-column record", () => {
    expect(overviewData()).toMatchObject({
      total: 0,
      active: 0,
      priorities: [],
    });
    expect(operationalPhase(piece(1, { column_id: "missing" }))).toBe(
      "registration",
    );
    expect(
      operationalPhase(
        piece(2, { column_id: "missing", operational_status: "ready" }),
      ),
    ).toBe("publication");
  });

  it("uses the same visible column for legacy photo cards and column filters", () => {
    const currentColumns = [
      ...columns,
      {
        id: "imported-photo",
        name: "Editar fotos (legado)",
        phase: "photos_pending",
      },
    ];
    const records = [
      piece(1, { column_id: "photos_pending" }),
      piece(2, { column_id: "imported-photo" }),
      piece(3, { column_id: "registration" }),
    ];
    const filtered = records.filter(
      (record) => presentedColumn(record, currentColumns) === "photos_pending",
    );
    expect(filtered.map((record) => record.id)).toEqual([1, 2]);
    expect(records[1].column_id).toBe("imported-photo");
    const custom = {
      id: "custom",
      name: "Bancada de fotos",
      phase: "photos_pending",
    };
    expect(
      presentedColumn(piece(4, { column_id: "custom" }), [
        ...currentColumns,
        custom,
      ]),
    ).toBe("custom");
  });

  it("reorders visible neighbors across hidden historical columns and preserves hidden positions", () => {
    const currentColumns = [
      { id: "registration", name: "Cadastro", phase: "registration" },
      { id: "old-ad", name: "Anunciadas (legado)", phase: "registration" },
      { id: "photos", name: "Fotografias pendentes", phase: "photos_pending" },
      {
        id: "old-photos",
        name: "Editar fotos (legado)",
        phase: "photos_pending",
      },
      { id: "listing", name: "Preparação", phase: "listing" },
    ];
    expect(
      reorderOperationalColumns(currentColumns, "registration", 1),
    ).toEqual(["photos", "old-ad", "registration", "old-photos", "listing"]);
    expect(reorderOperationalColumns(currentColumns, "listing", -1)).toEqual([
      "registration",
      "old-ad",
      "listing",
      "old-photos",
      "photos",
    ]);
    expect(currentColumns.map((column) => column.id)).toEqual([
      "registration",
      "old-ad",
      "photos",
      "old-photos",
      "listing",
    ]);
    expect(() =>
      reorderOperationalColumns(currentColumns, "registration", -1),
    ).toThrow();
    expect(() =>
      reorderOperationalColumns(currentColumns, "listing", 1),
    ).toThrow();
    expect(() =>
      reorderOperationalColumns(currentColumns, "old-ad", 1),
    ).toThrow();
  });
});
