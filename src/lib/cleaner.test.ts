import { describe, expect, it } from "vitest";
import { cleanedFileName, removeLightBackground, validateCleanerDimensions, validateCleanerFile } from "./cleaner";

function raster(rows: string[]) {
  const palette: Record<string, number[]> = { w: [255, 255, 255, 255], b: [10, 20, 30, 255], c: [240, 239, 238, 128], t: [0, 0, 0, 0] };
  return new Uint8ClampedArray(rows.flatMap((row) => [...row].flatMap((pixel) => palette[pixel])));
}

describe("light background cleanup", () => {
  it("removes edge-connected whites while preserving enclosed whites, colored artwork, dimensions, and the original", () => {
    const original = raster(["wwwww", "wbbbw", "wbwbw", "wbbbw", "wwwww"]);
    const snapshot = original.slice();
    const result = removeLightBackground(original, 5, 5, 20);
    expect(result.removed).toBe(16);
    expect(result.pixels.length).toBe(original.length);
    expect(result.pixels[3]).toBe(0);
    expect([...result.pixels.slice(12 * 4, 13 * 4)]).toEqual([255, 255, 255, 255]);
    expect([...result.pixels.slice(6 * 4, 7 * 4)]).toEqual([10, 20, 30, 255]);
    expect(original).toEqual(snapshot);
  });

  it("adjusts off-white removal and traverses existing transparent perimeter", () => {
    const original = raster(["ttt", "tct", "ttt"]);
    expect(removeLightBackground(original, 3, 3, 10).removed).toBe(0);
    expect(removeLightBackground(original, 3, 3, 20).removed).toBe(1);
    expect(removeLightBackground(original, 3, 3, 20).pixels[4 * 4 + 3]).toBe(0);
  });

  it("leaves dark backgrounds intact and reports no change", () => {
    const original = raster(["bbb", "bwb", "bbb"]);
    expect(removeLightBackground(original, 3, 3, 80)).toEqual({ pixels: original, removed: 0 });
  });

  it("does not connect isolated whites diagonally", () => {
    expect(removeLightBackground(raster(["wbb", "bwb", "bbb"]), 3, 3, 20).removed).toBe(1);
  });

  it("handles one-pixel and narrow images", () => {
    expect(removeLightBackground(raster(["w"]), 1, 1, 0).removed).toBe(1);
    expect(removeLightBackground(raster(["w", "b", "w"]), 1, 3, 0).removed).toBe(2);
  });

  it("rejects malformed pixels, unsafe dimensions, and invalid strengths", () => {
    expect(() => removeLightBackground(new Uint8ClampedArray(3), 1, 1, 20)).toThrow("incomplete");
    for (const strength of [-1, 81, NaN]) expect(() => removeLightBackground(raster(["w"]), 1, 1, strength)).toThrow("strength");
    expect(() => validateCleanerDimensions(4000, 4000)).toThrow("12 megapixels");
    expect(() => validateCleanerDimensions(0, 1)).toThrow("invalid dimensions");
    expect(() => validateCleanerDimensions(1.5, 1)).toThrow("invalid dimensions");
    expect(() => validateCleanerDimensions(4000, 3000)).not.toThrow();
  });
});

describe("cleaner input and export", () => {
  it("accepts PNG/JPG, but rejects unsupported, empty, and oversized inputs", () => {
    expect(validateCleanerFile({ type: "image/png", size: 1 })).toBeNull();
    expect(validateCleanerFile({ type: "image/jpeg", size: 20 * 1024 * 1024 })).toBeNull();
    expect(validateCleanerFile({ type: "image/svg+xml", size: 1 })).toMatch(/PNG or JPG/);
    expect(validateCleanerFile({ type: "image/png", size: 0 })).toMatch(/empty/);
    expect(validateCleanerFile({ type: "image/png", size: 20 * 1024 * 1024 + 1 })).toMatch(/20 MB/);
  });
  it("exports a safe PNG name regardless of the original extension", () => {
    expect(cleanedFileName("../My Art.JPG")).toBe("My-Art-cleaned.png");
    expect(cleanedFileName("!!!.PNG")).toBe("artwork-cleaned.png");
  });
});
