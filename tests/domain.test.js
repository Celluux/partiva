import { describe, it, expect } from "vitest";
import {
  applicability,
  cents,
  money,
  fees,
  missingFields,
  matches,
  suggestTitle,
  permissions,
  escapeHtml,
} from "../src/domain.js";
describe("Business rules", () => {
  it("keeps monetary cents and BR input", () => {
    expect(cents("1.234,56")).toBe(123456);
    expect(cents("12.34")).toBe(1234);
    expect(money(123456)).toContain("1.234,56");
    expect(cents("")).toBe(null);
    expect(() => cents("-10")).toThrow();
    expect(() => cents("12,345")).toThrow();
  });
  it("calculates configurable percent and fixed fees in cents", () => {
    expect(
      fees(10000, {
        fee_configured: true,
        fee_percent: 14,
        fee_fixed_cents: 600,
      }),
    ).toEqual({ fee: 2000, net: 8000 });
    expect(fees(10000, {})).toEqual({ fee: null, net: null });
  });
  it("uses conditional position and side without duplicating motor fields", () => {
    expect(applicability("Motor")).toEqual({ position: false, side: false });
    expect(applicability("Farol")).toEqual({ position: true, side: true });
    expect(applicability("Maçaneta")).toEqual({ position: true, side: true });
  });
  it("suggests editable titles without inventing facts", () => {
    expect(
      suggestTitle({
        part_name: "Motor",
        brand: "Fiat",
        model: "Argo",
        year: 2020,
      }),
    ).toBe("Motor Fiat Argo 2020");
  });
  it("checks essential data and distinct original photographs", () => {
    const p = {
      part_name: "Motor",
      detran_reference: "A",
      category: "Mecânica",
      brand: "Fiat",
      model: "Argo",
      year: 2020,
      title: "Motor Argo",
      price_cents: 100,
    };
    const c = { fee_configured: true, preferences: { minimum_photos: 2 } };
    expect(
      missingFields(
        p,
        [
          { id: "a", selected_for_listing: true },
          { id: "b", selected_for_listing: true },
        ],
        c,
      ),
    ).toEqual([]);
    expect(
      missingFields(
        p,
        [
          { id: "a", selected_for_listing: true },
          { id: "b", original_photo_id: "a", selected_for_listing: true },
        ],
        c,
      ),
    ).toHaveLength(1);
  });
  it("combines search, filters and archiving consistently", () => {
    const p = {
      internal_number: 10,
      part_name: "Módulo",
      category: "Elétrica",
      sale_status: "available",
    };
    expect(
      matches(
        p,
        { query: "modulo", category: "Elétrica", sale: "available" },
        [],
        {},
      ),
    ).toBe(true);
    expect(matches(p, { query: "modulo", sale: "sold" }, [], {})).toBe(false);
    expect(matches({ ...p, archived_at: "today" }, {}, [], {})).toBe(false);
  });
  it("separates employee capabilities", () => {
    expect(permissions("viewer").parts).toBe(false);
    expect(permissions("photographer").photos).toBe(true);
    expect(permissions("operator").admin).toBe(false);
    expect(permissions("sales").sales).toBe(true);
    expect(permissions("admin").admin).toBe(true);
  });
  it("escapes untrusted user content", () => {
    expect(escapeHtml('<img onerror="x">')).not.toContain("<img");
  });
});
