import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Variant = { color?: string | null; size?: string | null; cost?: number | string | null; sku?: string | null };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

function money(cost: Variant["cost"]) {
  const base = Math.max(0, Number(cost) || 0);
  const target = Math.max(base * 2.2, base + 15, 24);
  return (Math.ceil(target) - 0.01).toFixed(2);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

function cleanOption(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 255) : "";
}

function errorStatus(message: string) {
  if (message === "Sign in required" || message === "Invalid or expired sign-in") return 401;
  if (message.includes("not connected") || message.includes("not configured")) return 503;
  return 400;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) throw new Error("Sign in required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) throw new Error("Supabase authentication is not configured");
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) throw new Error("Invalid or expired sign-in");

    const domain = (Deno.env.get("SHOPIFY_STORE_DOMAIN") || "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    const token = Deno.env.get("SHOPIFY_ADMIN_ACCESS_TOKEN");
    if (!domain || !token) throw new Error("Shopify is not connected. Configure SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN in Supabase secrets.");
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) throw new Error("SHOPIFY_STORE_DOMAIN must be a valid myshopify.com domain");

    const body = await request.json();
    const cleanTitle = typeof body?.title === "string" ? body.title.trim().slice(0, 255) : "";
    const placement = cleanOption(body?.placement || "front").replaceAll("_", " ") || "front";
    const rawVariants: Variant[] = Array.isArray(body?.variants) ? body.variants : [];
    if (!cleanTitle || !Array.isArray(rawVariants) || rawVariants.length === 0) throw new Error("Product title, approved mockup, and at least one variant are required");
    if (rawVariants.length > 250) throw new Error("This product has too many variants for a single draft");

    let mockupUrl: URL;
    try { mockupUrl = new URL(String(body?.mockup_url || "")); } catch { throw new Error("Approved mockup URL is invalid"); }
    const approvedMockupHost = mockupUrl.hostname === "printful.com" ||
      mockupUrl.hostname.endsWith(".printful.com") ||
      mockupUrl.hostname === "printful-upload.s3-accelerate.amazonaws.com";
    if (mockupUrl.protocol !== "https:" || !approvedMockupHost) {
      throw new Error("Approved mockup must be a secure Printful image");
    }

    const seen = new Set<string>();
    const variants = rawVariants.flatMap((variant) => {
      const color = cleanOption(variant.color);
      const size = cleanOption(variant.size);
      const cost = Number(variant.cost);
      if (!Number.isFinite(cost) || cost < 0) return [];
      const key = `${color}\u0000${size}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ color, size, cost }];
    });
    if (variants.length === 0) throw new Error("No valid product variants were supplied");

    const colors = [...new Set(variants.map((variant) => variant.color).filter(Boolean))];
    const sizes = [...new Set(variants.map((variant) => variant.size).filter(Boolean))];
    const options: { name: string; values: { name: string }[] }[] = [];
    if (colors.length) options.push({ name: "Color", values: colors.map((name) => ({ name })) });
    if (sizes.length) options.push({ name: "Size", values: sizes.map((name) => ({ name })) });
    if (!options.length) options.push({ name: "Style", values: [{ name: "Standard" }] });

    const productVariants = variants.map((variant) => ({
      price: Number(money(variant.cost)),
      optionValues: options.map((option) => ({
        optionName: option.name,
        name: option.name === "Color" ? (variant.color || colors[0]) : option.name === "Size" ? (variant.size || sizes[0]) : "Standard",
      })),
    }));
    const titleHtml = escapeHtml(cleanTitle);
    const placementHtml = escapeHtml(placement);
    const story = `<p><strong>${titleHtml}</strong> turns original artwork into something made to live with, not just something to look at.</p><p>Created through Frontline's artist-led process, this piece carries the energy of handmade work while being produced on demand to reduce waste. The ${placementHtml} placement keeps the design intentional.</p><p>Made to order. Please review the selected size and color before checkout.</p>`;
    const query = `mutation CreateDraft($input: ProductSetInput!) { productSet(synchronous: true, input: $input) { product { id title status } userErrors { field message } } }`;
    const input = {
      title: cleanTitle,
      descriptionHtml: story,
      status: "DRAFT",
      vendor: "Frontline",
      productType: "Artist Designed",
      productOptions: options,
      variants: productVariants,
      files: [{ originalSource: mockupUrl.toString(), alt: `${cleanTitle} product mockup`, contentType: "IMAGE" }],
    };

    const response = await fetch(`https://${domain}/admin/api/2026-07/graphql.json`, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { input } }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Shopify returned ${response.status}`);
    if (data?.errors?.length) throw new Error(data.errors.map((error: { message: string }) => error.message).join("; ").slice(0, 500));
    const userErrors = data?.data?.productSet?.userErrors || [];
    if (userErrors.length) throw new Error(userErrors.map((error: { message: string }) => error.message).join("; ").slice(0, 500));
    const product = data?.data?.productSet?.product;
    if (!product) throw new Error("Shopify did not return the created draft");
    const numericId = String(product.id).split("/").pop();
    return json({ product: { id: product.id, title: product.title, status: product.status, admin_url: `https://${domain}/admin/products/${numericId}` } });
  } catch (error) {
    const message = error instanceof DOMException && error.name === "TimeoutError"
      ? "Shopify timed out. Check the draft list before trying again."
      : error instanceof Error ? error.message : "Unexpected Shopify error";
    return json({ error: message }, errorStatus(message));
  }
});
