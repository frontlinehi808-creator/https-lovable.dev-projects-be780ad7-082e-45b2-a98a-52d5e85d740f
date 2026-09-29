// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanImage } from "./clean-image";

let decodeFailure = false;
let imageWidth = 2;
let encodeFailure = false;
const createUrl = vi.fn(() => "blob:source");
const revokeUrl = vi.fn();
const draw = vi.fn();
const put = vi.fn();

beforeEach(() => {
  decodeFailure = false;
  imageWidth = 2;
  encodeFailure = false;
  vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
  vi.stubGlobal("Image", class {
    naturalWidth = imageWidth;
    naturalHeight = 1;
    onload = () => {};
    onerror = () => {};
    set src(_value: string) { queueMicrotask(() => decodeFailure ? this.onerror() : this.onload()); }
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: draw,
    getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255, 20, 30, 40, 255]) }),
    putImageData: put,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(encodeFailure ? null : new Blob(["encoded pixels"], { type: "image/png" })));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("browser cleanup and PNG encoding", () => {
  it("sends cleaned pixels at the original dimensions to the PNG encoder", async () => {
    const result = await cleanImage(new File(["source"], "art.jpg", { type: "image/jpeg" }), 20);
    expect(result).toMatchObject({ width: 2, height: 1, removed: 1 });
    expect(result.blob.type).toBe("image/png");
    expect(put.mock.calls[0][0].data).toEqual(new Uint8ClampedArray([255, 255, 255, 0, 20, 30, 40, 255]));
    const canvas = vi.mocked(HTMLCanvasElement.prototype.toBlob).mock.contexts[0] as unknown as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([2, 1]);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
    expect(revokeUrl).toHaveBeenCalledWith("blob:source");
  });

  it("releases the source URL when decoding fails", async () => {
    decodeFailure = true;
    await expect(cleanImage(new File(["bad"], "bad.png", { type: "image/png" }), 20)).rejects.toThrow("could not be read");
    expect(revokeUrl).toHaveBeenCalledWith("blob:source");
  });

  it("rejects oversized decoded images before allocating a canvas", async () => {
    imageWidth = 12_000_001;
    await expect(cleanImage(new File(["large"], "large.png", { type: "image/png" }), 20)).rejects.toThrow("12 megapixels");
    expect(draw).not.toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith("blob:source");
  });

  it("reports missing canvas support and export failures without leaking source URLs", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
    const file = new File(["source"], "art.png", { type: "image/png" });
    await expect(cleanImage(file, 20)).rejects.toThrow("browser cannot clean");
    encodeFailure = true;
    await expect(cleanImage(file, 20)).rejects.toThrow("could not be saved");
    expect(revokeUrl).toHaveBeenCalledTimes(2);
  });
});
