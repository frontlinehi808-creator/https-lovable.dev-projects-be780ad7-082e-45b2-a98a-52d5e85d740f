export type PrintfulStore = { id: number; name: string; type: string };

export type OperatorProduct = {
  id: string | number;
  name: string;
  color: string | null;
  size: string | null;
  thumbnail_url: string | null;
  sync_data: {
    variant?: {
      retail_price?: number | string | null;
      price?: number | string | null;
      sku?: string | null;
      external_id?: string | null;
      variant_id?: number | string | null;
      product?: {
        price?: number | string | null;
        product_id?: number | string | null;
        variant_id?: number | string | null;
      };
    };
  } | null;
};

export type DraftVariant = { color: string | null; size: string | null; cost: number; sku: string | null };
export type MockupResult = { url: string; product: string; placement: string };
export type DraftProduct = { id: string; title: string; status: string; admin_url: string };
export type StatusMessage = { tone: "working" | "success" | "error"; text: string };

const acceptedArtworkTypes = new Set(["image/png", "image/jpeg"]);
const maxArtworkBytes = 20 * 1024 * 1024;

export function sanitizeFileName(name: string) {
  const extension = name.includes(".") ? `.${name.split(".").pop()?.toLowerCase()}` : "";
  const stem = name.replace(/\.[^.]+$/, "").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${stem || "artwork"}${extension}`;
}

function imageDimensions(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Artwork could not be read as an image."));
    };
    image.src = url;
  });
}

export async function validateArtwork(file: File) {
  if (!acceptedArtworkTypes.has(file.type)) return "Use a PNG or JPG artwork file.";
  if (file.size === 0) return "The selected artwork file is empty.";
  if (file.size > maxArtworkBytes) return "Artwork must be 20 MB or smaller.";
  try {
    const { width, height } = await imageDimensions(file);
    if (width < 800 || height < 800) return "Artwork must be at least 800 × 800 pixels for a usable print.";
  } catch (error) {
    return getErrorMessage(error, "Artwork could not be read as an image.");
  }
  return null;
}

export function extractCatalogIds(product: OperatorProduct) {
  const variant = product.sync_data?.variant;
  const catalogProductId = Number(variant?.product?.product_id);
  const catalogVariantId = Number(variant?.product?.variant_id ?? variant?.variant_id);
  if (!Number.isInteger(catalogProductId) || catalogProductId <= 0 || !Number.isInteger(catalogVariantId) || catalogVariantId <= 0) {
    throw new Error("This product is missing Printful catalog IDs. Sync it in Artisan Studio first.");
  }
  return { catalogProductId, catalogVariantId };
}

export function buildDraftVariants(products: OperatorProduct[]): DraftVariant[] {
  const seen = new Set<string>();
  return products.flatMap((product) => {
    const variant = product.sync_data?.variant;
    const cost = Number(variant?.retail_price ?? variant?.price ?? variant?.product?.price);
    if (!Number.isFinite(cost) || cost < 0) return [];
    const key = `${product.color ?? ""}\u0000${product.size ?? ""}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ color: product.color, size: product.size, cost, sku: variant?.sku ?? variant?.external_id ?? null }];
  });
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}
