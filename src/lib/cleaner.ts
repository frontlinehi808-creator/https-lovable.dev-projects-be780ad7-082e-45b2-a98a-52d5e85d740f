import { sanitizeFileName } from "./workflow";

export const MAX_CLEANER_PIXELS = 12_000_000;

export function validateCleanerFile(file: Pick<File, "type" | "size">) {
  if (!["image/png", "image/jpeg"].includes(file.type)) return "Choose a PNG or JPG image.";
  if (!file.size) return "The selected image is empty.";
  if (file.size > 20 * 1024 * 1024) return "Choose an image of 20 MB or smaller.";
  return null;
}

export function validateCleanerDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("The image has invalid dimensions.");
  }
  if (width * height > MAX_CLEANER_PIXELS) {
    throw new Error("Choose an image of 12 megapixels or smaller to clean safely on your phone.");
  }
}

export function cleanedFileName(name: string) {
  return `${sanitizeFileName(name).replace(/\.[^.]+$/, "")}-cleaned.png`;
}

// Flood-fill from the perimeter only. Enclosed light details are preserved.
// Work on a copy so neither the original pixels nor its transparency change.
export function removeLightBackground(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number,
) {
  validateCleanerDimensions(width, height);
  if (pixels.length !== width * height * 4) throw new Error("The image pixels are incomplete.");
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 80) {
    throw new Error("Background strength must be between 0 and 80.");
  }
  const output = new Uint8ClampedArray(pixels);
  const seen = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0;
  let tail = 0;
  let removed = 0;
  const minimum = 255 - tolerance;
  function visit(index: number) {
    if (seen[index]) return;
    seen[index] = 1;
    const offset = index * 4;
    if (pixels[offset + 3] === 0 || (
      pixels[offset] >= minimum && pixels[offset + 1] >= minimum && pixels[offset + 2] >= minimum
    )) queue[tail++] = index;
  }
  for (let x = 0; x < width; x++) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const offset = index * 4;
    if (output[offset + 3] !== 0) removed++;
    output[offset + 3] = 0;
    if (index % width > 0) visit(index - 1);
    if (index % width < width - 1) visit(index + 1);
    if (index >= width) visit(index - width);
    if (index < width * (height - 1)) visit(index + width);
  }
  return { pixels: output, removed };
}
