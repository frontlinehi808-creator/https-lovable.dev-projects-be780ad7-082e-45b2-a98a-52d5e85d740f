import { removeLightBackground, validateCleanerDimensions, validateCleanerFile } from "./cleaner";

export type CleanedImage = { blob: Blob; width: number; height: number; removed: number };

export async function cleanImage(file: File, tolerance: number): Promise<CleanedImage> {
  const error = validateCleanerFile(file);
  if (error) throw new Error(error);
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("The selected file could not be read as an image."));
      img.src = source;
    });
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    validateCleanerDimensions(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Your browser cannot clean this image. Try a current browser.");
    context.drawImage(image, 0, 0);
    const original = context.getImageData(0, 0, width, height);
    // Give the browser a chance to show the working state before processing.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const cleaned = removeLightBackground(original.data, width, height, tolerance);
    original.data.set(cleaned.pixels);
    context.putImageData(original, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("The cleaned PNG could not be saved. Please try again.")), "image/png");
    });
    return { blob, width, height, removed: cleaned.removed };
  } finally {
    URL.revokeObjectURL(source);
  }
}
