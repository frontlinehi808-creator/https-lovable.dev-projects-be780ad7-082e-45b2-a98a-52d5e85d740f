import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const allowed = (path: string, method: string) =>
  (method === "GET" && path === "/stores") ||
  (method === "GET" && /^\/mockup-generator\/printfiles\/\d+$/.test(path)) ||
  (method === "POST" && /^\/mockup-generator\/create-task\/\d+$/.test(path)) ||
  (method === "GET" && path === "/mockup-generator/task");

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

function errorStatus(message: string) {
  if (message === "Sign in required" || message === "Invalid or expired sign-in") return 401;
  if (message.includes("not configured")) return 503;
  return 400;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) throw new Error("Sign in required");

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anonKey) throw new Error("Supabase authentication is not configured");
    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) throw new Error("Invalid or expired sign-in");

    const token = Deno.env.get("PRINTFUL_API_KEY");
    if (!token) throw new Error("PRINTFUL_API_KEY is not configured in Supabase Edge Function secrets");

    const body = await request.json();
    const path = typeof body?.path === "string" ? body.path : "";
    const method = String(body?.method || "GET").toUpperCase();
    if (!allowed(path, method)) throw new Error("This Printful operation is not allowed");

    const storeId = body?.store_id === undefined ? undefined : Number(body.store_id);
    if (storeId !== undefined && (!Number.isSafeInteger(storeId) || storeId <= 0)) throw new Error("A valid Printful store is required");

    const upstreamUrl = new URL(path.replace(/^\//, ""), "https://api.printful.com/");
    if (path === "/mockup-generator/task") {
      const taskKey = body?.params?.task_key;
      if (typeof taskKey !== "string" || !/^[a-zA-Z0-9_-]{8,200}$/.test(taskKey)) throw new Error("A valid mockup task key is required");
      upstreamUrl.searchParams.set("task_key", taskKey);
    } else if (body?.params && Object.keys(body.params).length > 0) {
      throw new Error("Query parameters are not allowed for this Printful operation");
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (storeId) headers["X-PF-Store-Id"] = String(storeId);

    const payload = body?.payload;
    const serializedPayload = payload === undefined ? undefined : JSON.stringify(payload);
    if (serializedPayload && serializedPayload.length > 100_000) throw new Error("Printful request is too large");

    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body: method === "POST" ? serializedPayload : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const providerMessage = data?.error?.message || data?.error?.reason || data?.result || `Printful returned ${upstream.status}`;
      return json({ error: String(providerMessage).slice(0, 500) }, upstream.status >= 500 ? 502 : upstream.status);
    }
    return json({ data });
  } catch (error) {
    const message = error instanceof DOMException && error.name === "TimeoutError"
      ? "Printful timed out. Try again."
      : error instanceof Error ? error.message : "Unexpected Printful error";
    return json({ error: message }, errorStatus(message));
  }
});
