import { describe, expect, it } from "vitest";
import { buildDraftVariants, extractCatalogIds, getErrorMessage, sanitizeFileName } from "./workflow";
import type { OperatorProduct } from "./workflow";

function product(overrides: Partial<OperatorProduct> = {}): OperatorProduct {
  return {
    id: "variant-1",
    name: "Studio Tee",
    color: "Black",
    size: "M",
    thumbnail_url: null,
    sync_data: { variant: { price: "12.50", sku: "TEE-M", product: { product_id: 71, variant_id: 99 } } },
    ...overrides,
  };
}

describe("sanitizeFileName", () => {
  it("removes path and punctuation while preserving a normalized extension", () => {
    expect(sanitizeFileName("../My Final Art! (2).PNG")).toBe("My-Final-Art-2.png");
  });

  it("uses a safe fallback for punctuation-only names", () => {
    expect(sanitizeFileName("!!!.jpg")).toBe("artwork.jpg");
  });
});

describe("extractCatalogIds", () => {
  it("normalizes valid nested Printful identifiers", () => {
    expect(extractCatalogIds(product())).toEqual({ catalogProductId: 71, catalogVariantId: 99 });
  });

  it("rejects products that were not completely synchronized", () => {
    expect(() => extractCatalogIds(product({ sync_data: null }))).toThrow("missing Printful catalog IDs");
  });
});

describe("buildDraftVariants", () => {
  it("deduplicates option combinations and removes invalid costs", () => {
    const variants = buildDraftVariants([
      product(),
      product({ id: "duplicate" }),
      product({ id: "large", size: "L", sync_data: { variant: { price: 13, product: { product_id: 71, variant_id: 100 } } } }),
      product({ id: "bad", size: "XL", sync_data: { variant: { price: "not-a-number" } } }),
    ]);
    expect(variants).toEqual([
      { color: "Black", size: "M", cost: 12.5, sku: "TEE-M" },
      { color: "Black", size: "L", cost: 13, sku: null },
    ]);
  });
});

describe("getErrorMessage", () => {
  it("uses Error messages and falls back for unknown values", () => {
    expect(getErrorMessage(new Error("Provider offline"), "Fallback")).toBe("Provider offline");
    expect(getErrorMessage({ nope: true }, "Fallback")).toBe("Fallback");
  });
});
