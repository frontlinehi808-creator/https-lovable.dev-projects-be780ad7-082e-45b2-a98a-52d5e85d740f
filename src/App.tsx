import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CloudUpload,
  ImageIcon,
  LoaderCircle,
  LogOut,
  PackageCheck,
  RefreshCw,
  Shirt,
  Store as StoreIcon,
  X,
} from "lucide-react";
import { supabase } from "./supabase";
import {
  buildDraftVariants,
  extractCatalogIds,
  getErrorMessage,
  sanitizeFileName,
  validateArtwork,
} from "./lib/workflow";
import type {
  DraftProduct,
  MockupResult,
  OperatorProduct,
  PrintfulStore,
  StatusMessage,
} from "./lib/workflow";

const placements = [
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
  { value: "sleeve_left", label: "Left sleeve" },
  { value: "sleeve_right", label: "Right sleeve" },
] as const;

type ArtworkAsset = { id: string; name: string; url: string; preview: string };
const productRoles = ["Baby / onesie", "Kids", "Mom", "Dad", "Family matching", "Accessory"];

async function callPrintful<T>(
  path: string,
  method = "GET",
  payload?: unknown,
  params?: Record<string, string>,
  storeId?: number,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("printful", {
    body: { path, method, payload, params, store_id: storeId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data?.data?.result ?? data?.data) as T;
}

async function createShopifyDraft(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("shopify-draft", {
    body: payload,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.product as DraftProduct;
}

function Status({ status }: { status: StatusMessage }) {
  const Icon = status.tone === "success" ? CheckCircle2 : status.tone === "error" ? CircleAlert : LoaderCircle;
  return (
    <div className={`status status-${status.tone}`} role="status" aria-live="polite">
      <Icon size={16} className={status.tone === "working" ? "spin" : undefined} aria-hidden="true" />
      <span>{status.text}</span>
    </div>
  );
}

function SignIn({ onReady }: { onReady: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) setError(signInError.message);
    else onReady();
    setBusy(false);
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="signin-title">
        <div className="wordmark"><span>F</span> Frontline Operator</div>
        <p className="eyebrow">Design Drop</p>
        <h1 id="signin-title">Operator sign in</h1>
        <p className="auth-copy">Private production access for approved Frontline operators.</p>
        <form onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          {error && <p className="form-error" role="alert"><CircleAlert size={16} />{error}</p>}
          <button className="primary-button" disabled={busy || !email.trim() || !password} type="submit">
            {busy ? <LoaderCircle className="spin" size={18} /> : <ChevronRight size={18} />}
            {busy ? "Signing in" : "Enter product desk"}
          </button>
        </form>
      </section>
      <aside className="auth-aside" aria-label="Workflow summary">
        <div className="auth-art"><Shirt aria-hidden="true" /></div>
        <p>Artwork to approved Shopify draft.</p>
        <span>Nothing publishes automatically.</span>
      </aside>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [stores, setStores] = useState<PrintfulStore[]>([]);
  const [products, setProducts] = useState<OperatorProduct[]>([]);
  const [storeId, setStoreId] = useState<number>();
  const [productId, setProductId] = useState("");
  const [placement, setPlacement] = useState("front");
  const [artworkUrl, setArtworkUrl] = useState("");
  const [artworkPreview, setArtworkPreview] = useState("");
  const [artworkName, setArtworkName] = useState("");
  const [artworkAssets, setArtworkAssets] = useState<ArtworkAsset[]>([]);
  const [collectionName, setCollectionName] = useState("Forging Hammahs");
  const [productRole, setProductRole] = useState("Baby / onesie");
  const [designDirection, setDesignDirection] = useState("Matching island-workwear artwork for babies, kids, moms, and dads. Keep the hammer, cream/teal/black palette, and a warm family connection across the set.");
  const [busy, setBusy] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [status, setStatus] = useState<StatusMessage>({ tone: "working", text: "Connecting to production services" });
  const [result, setResult] = useState<MockupResult | null>(null);
  const [draft, setDraft] = useState<DraftProduct | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const product = useMemo(
    () => products.find((item) => String(item.id) === productId),
    [products, productId],
  );
  const groupedProducts = useMemo(() => {
    const groups = new Map<string, OperatorProduct[]>();
    products.forEach((item) => groups.set(item.name, [...(groups.get(item.name) ?? []), item]));
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [products]);
  const currentStep = draft ? 4 : result ? 4 : artworkUrl && product ? 3 : artworkUrl ? 2 : 1;

  const loadWorkspace = useCallback(async () => {
    setLoadingData(true);
    setStatus({ tone: "working", text: "Syncing Printful stores and product catalog" });
    try {
      const [nextStores, productResponse] = await Promise.all([
        callPrintful<PrintfulStore[]>("/stores"),
        supabase.from("printful_products").select("*").order("name").order("color").order("size"),
      ]);
      if (productResponse.error) throw productResponse.error;
      setStores(nextStores ?? []);
      setStoreId((current) => current ?? nextStores?.[0]?.id);
      setProducts((productResponse.data ?? []) as OperatorProduct[]);
      setStatus({
        tone: "success",
        text: `${nextStores?.length ?? 0} store${nextStores?.length === 1 ? "" : "s"} connected · ${productResponse.data?.length ?? 0} variants ready`,
      });
    } catch (error) {
      setStatus({ tone: "error", text: getErrorMessage(error, "Could not load the product workspace") });
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setAuthReady(true);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session) void loadWorkspace();
    else if (authReady) {
      setStores([]);
      setProducts([]);
    }
  }, [session, authReady, loadWorkspace]);

  async function uploadFiles(files: FileList) {
    setBusy(true);
    setResult(null);
    setDraft(null);
    setStatus({ tone: "working", text: `Uploading ${files.length} collection image${files.length === 1 ? "" : "s"} securely` });
    const added: ArtworkAsset[] = [];
    try {
      for (const file of Array.from(files)) {
        const validationError = await validateArtwork(file);
        if (validationError) throw new Error(`${file.name}: ${validationError}`);
        const preview = URL.createObjectURL(file);
        const path = `designs/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
        const { error } = await supabase.storage.from("printful-designs").upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
        if (error) { URL.revokeObjectURL(preview); throw error; }
        const { data, error: signError } = await supabase.storage.from("printful-designs").createSignedUrl(path, 3600);
        if (signError) { URL.revokeObjectURL(preview); throw signError; }
        added.push({ id: crypto.randomUUID(), name: file.name, url: data.signedUrl, preview });
      }
      setArtworkAssets((current) => [...current, ...added]);
      const active = added[0];
      if (active) { setArtworkPreview(active.preview); setArtworkName(active.name); setArtworkUrl(active.url); }
      setStatus({ tone: "success", text: `${added.length} image${added.length === 1 ? "" : "s"} added to ${collectionName}` });
    } catch (error) {
      added.forEach((asset) => URL.revokeObjectURL(asset.preview));
      setStatus({ tone: "error", text: getErrorMessage(error, "Artwork upload failed") });
    } finally {
      if (fileInput.current) fileInput.current.value = "";
      setBusy(false);
    }
  }

  function selectArtwork(asset: ArtworkAsset) {
    setArtworkPreview(asset.preview); setArtworkName(asset.name); setArtworkUrl(asset.url); setResult(null); setDraft(null);
    setStatus({ tone: "success", text: `${asset.name} selected for the next ${productRole.toLowerCase()} mockup` });
  }

  function clearArtwork() {
    const remaining = artworkAssets.filter((asset) => asset.url !== artworkUrl);
    const removed = artworkAssets.find((asset) => asset.url === artworkUrl);
    if (removed) URL.revokeObjectURL(removed.preview);
    setArtworkAssets(remaining);
    const next = remaining[0];
    setArtworkPreview(next?.preview ?? ""); setArtworkName(next?.name ?? ""); setArtworkUrl(next?.url ?? "");
    setResult(null);
    setDraft(null);
    if (fileInput.current) fileInput.current.value = "";
    setStatus({ tone: "success", text: "Choose new artwork to begin another drop" });
  }

  async function generate() {
    if (!product || !artworkUrl || !storeId) return;
    setBusy(true);
    setResult(null);
    setDraft(null);
    setStatus({ tone: "working", text: "Building your Printful mockup" });
    try {
      const { catalogProductId, catalogVariantId } = extractCatalogIds(product);
      const info = await callPrintful<any>(`/mockup-generator/printfiles/${catalogProductId}`, "GET", undefined, undefined, storeId);
      const entry = info.variant_printfiles?.find((item: any) => Number(item.variant_id) === catalogVariantId);
      const printfileId = entry?.placements?.[placement];
      const area = info.printfiles?.find((item: any) => Number(item.printfile_id) === Number(printfileId));
      if (!printfileId) throw new Error("That placement is not available for the selected product variant.");
      const width = Number(area?.width) || 1800;
      const height = Number(area?.height) || 2400;
      const task = await callPrintful<{ task_key: string }>(
        `/mockup-generator/create-task/${catalogProductId}`,
        "POST",
        {
          variant_ids: [catalogVariantId],
          format: "png",
          files: [{ placement, image_url: artworkUrl, position: { area_width: width, area_height: height, width, height, top: 0, left: 0 } }],
        },
        undefined,
        storeId,
      );
      if (!task?.task_key) throw new Error("Printful did not return a mockup task.");
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 10_000 : 3_000));
        const poll = await callPrintful<any>("/mockup-generator/task", "GET", undefined, { task_key: task.task_key }, storeId);
        if (poll.status === "failed") throw new Error(poll.error?.message || "Printful could not generate this mockup.");
        if (["completed", "done"].includes(poll.status)) {
          const url = poll.mockups?.[0]?.mockup_url || poll.mockups?.[0]?.preview_url;
          if (!url) throw new Error("Printful completed without returning a mockup image.");
          setResult({ url, product: product.name, placement });
          setStatus({ tone: "success", text: "Mockup ready for manual approval · nothing has been sent to Shopify" });
          return;
        }
      }
      throw new Error("Printful is taking longer than expected. Try generating again.");
    } catch (error) {
      setStatus({ tone: "error", text: getErrorMessage(error, "Mockup generation failed") });
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!result || !product) return;
    setBusy(true);
    setStatus({ tone: "working", text: "Creating an unpublished Shopify draft" });
    try {
      const variants = buildDraftVariants(products.filter((item) => item.name === product.name));
      const nextDraft = await createShopifyDraft({
        title: `${collectionName} — ${result.product}`,
        collection_name: collectionName,
        product_role: productRole,
        design_direction: designDirection,
        mockup_url: result.url,
        placement: result.placement,
        variants,
      });
      setDraft(nextDraft);
      setStatus({ tone: "success", text: `Shopify draft created · ${nextDraft.title} remains unpublished` });
    } catch (error) {
      setStatus({ tone: "error", text: getErrorMessage(error, "Shopify draft creation failed") });
    } finally {
      setBusy(false);
    }
  }

  if (!authReady) {
    return <main className="loading-screen"><LoaderCircle className="spin" aria-hidden="true" /><span>Loading Frontline Operator</span></main>;
  }
  if (!session) return <SignIn onReady={() => undefined} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="wordmark"><span>F</span><b>Frontline</b><small>Operator</small></div>
        <nav aria-label="Operator tools">
          <button className="nav-item active" type="button"><ImageIcon size={18} />Design Drop</button>
          <div className="nav-item muted"><Shirt size={18} />Printful</div>
          <div className="nav-item muted"><StoreIcon size={18} />Shopify drafts</div>
        </nav>
        <div className="sidebar-foot">
          <span>{session.user.email}</span>
          <button type="button" title="Sign out" aria-label="Sign out" onClick={() => void supabase.auth.signOut()}><LogOut size={18} /></button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Design Drop</p>
            <h1>Collection builder</h1>
          </div>
          <button className="icon-button" type="button" title="Refresh stores and products" aria-label="Refresh stores and products" disabled={loadingData || busy} onClick={() => void loadWorkspace()}>
            <RefreshCw size={18} className={loadingData ? "spin" : undefined} />
          </button>
        </header>

        <Status status={status} />

        <ol className="stepper" aria-label="Design drop progress">
          {["Artwork", "Product", "Mockup", "Approval"].map((label, index) => {
            const number = index + 1;
            return <li key={label} className={number < currentStep ? "complete" : number === currentStep ? "current" : ""}><span>{number < currentStep ? <Check size={14} /> : number}</span>{label}</li>;
          })}
        </ol>

        <div className="work-grid">
          <section className="controls" aria-labelledby="setup-title">
            <div className="section-heading">
              <div><p className="section-index">01—03</p><h2 id="setup-title">Set up the drop</h2></div>
              <p>Choose artwork, the Printful variant, and its placement.</p>
            </div>

            <div className="field-pair collection-fields">
              <div className="field-group"><label htmlFor="collection">Collection</label><input id="collection" value={collectionName} onChange={(event) => setCollectionName(event.target.value)} /></div>
              <div className="field-group"><label htmlFor="role">Product role</label><select id="role" value={productRole} onChange={(event) => setProductRole(event.target.value)}>{productRoles.map((role) => <option key={role}>{role}</option>)}</select></div>
            </div>
            <div className="field-group"><label htmlFor="direction">Matching-set direction</label><textarea id="direction" rows={3} value={designDirection} onChange={(event) => setDesignDirection(event.target.value)} /></div>

            <div className="field-group">
              <label htmlFor="artwork">Collection artwork</label>
              {artworkPreview ? (
                <div className="artwork-row">
                  <div className="artwork-thumb"><img src={artworkPreview} alt="Uploaded artwork preview" /></div>
                  <div><strong>{artworkName}</strong><span>Selected for the next mockup</span></div>
                  <button className="icon-button" type="button" title="Remove artwork" aria-label="Remove artwork" onClick={clearArtwork} disabled={busy}><X size={18} /></button>
                </div>
              ) : (
                <label className="dropzone" htmlFor="artwork">
                  <CloudUpload size={24} aria-hidden="true" />
                  <strong>Choose one or several PNG or JPG images</strong>
                  <span>Maximum 20 MB · at least 800 × 800 px</span>
                </label>
              )}
              {artworkPreview && <label className="add-artwork" htmlFor="artwork"><CloudUpload size={16} /> Add more collection images</label>}
              <input ref={fileInput} className="visually-hidden" id="artwork" type="file" multiple accept="image/png,image/jpeg" disabled={busy} onChange={(event) => event.target.files && void uploadFiles(event.target.files)} />
              {artworkAssets.length > 1 && <div className="artwork-library" aria-label="Collection images">{artworkAssets.map((asset) => <button key={asset.id} className={asset.url === artworkUrl ? "selected" : ""} type="button" onClick={() => selectArtwork(asset)}><img src={asset.preview} alt={asset.name} /><span>{asset.name}</span></button>)}</div>}
            </div>

            <div className="field-pair">
              <div className="field-group">
                <label htmlFor="store">Printful store</label>
                <select id="store" value={storeId ?? ""} disabled={loadingData || busy || stores.length === 0} onChange={(event) => setStoreId(Number(event.target.value))}>
                  {stores.length === 0 && <option value="">No stores available</option>}
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.name} ({store.type})</option>)}
                </select>
              </div>
              <div className="field-group">
                <label htmlFor="placement">Placement</label>
                <select id="placement" value={placement} disabled={busy} onChange={(event) => { setPlacement(event.target.value); setResult(null); setDraft(null); }}>
                  {placements.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="product">Product variant</label>
              <select id="product" value={productId} disabled={loadingData || busy || products.length === 0} onChange={(event) => { setProductId(event.target.value); setResult(null); setDraft(null); }}>
                <option value="">Choose a cached product</option>
                {groupedProducts.map(([name, items]) => <optgroup key={name} label={name}>{items.map((item) => <option key={item.id} value={String(item.id)}>{[item.color, item.size].filter(Boolean).join(" / ") || "Standard"}</option>)}</optgroup>)}
              </select>
              {product?.thumbnail_url && <div className="product-inline"><img src={product.thumbnail_url} alt="" /><span>{product.name}<small>{[product.color, product.size].filter(Boolean).join(" · ")}</small></span></div>}
            </div>

            <button className="primary-button generate-button" disabled={busy || loadingData || !artworkUrl || !product || !storeId} type="button" onClick={() => void generate()}>
              {busy && !result ? <LoaderCircle className="spin" size={18} /> : <Shirt size={18} />}
              {busy && !result ? "Generating mockup" : result ? "Regenerate mockup" : "Generate mockup"}
            </button>
          </section>

          <section className={`preview ${result ? "has-result" : ""}`} aria-labelledby="preview-title">
            <div className="section-heading preview-heading">
              <div><p className="section-index">04</p><h2 id="preview-title">Review & approve</h2></div>
              {result && <span className="approval-badge"><CheckCircle2 size={15} />Ready to review</span>}
            </div>
            {result ? (
              <>
                <div className="mockup-stage"><img src={result.url} alt={`${result.product} ${result.placement.replace(/_/g, " ")} mockup`} /></div>
                <div className="result-details">
                  <div><strong>{result.product}</strong><span>{placements.find((item) => item.value === result.placement)?.label} placement</span></div>
                  <a className="icon-button" href={result.url} target="_blank" rel="noreferrer" title="Open full-size mockup" aria-label="Open full-size mockup"><ArrowUpRight size={18} /></a>
                </div>
                {draft ? (
                  <div className="draft-complete">
                    <PackageCheck size={23} />
                    <div><strong>Draft created in Shopify</strong><span>It is unpublished and ready for your final review.</span></div>
                    <a className="primary-button" href={draft.admin_url} target="_blank" rel="noreferrer">Review draft <ArrowUpRight size={17} /></a>
                  </div>
                ) : (
                  <div className="approval-actions">
                    <p>Approval creates a Shopify draft with pricing, variants, product story, and this mockup. It never publishes the product.</p>
                    <button className="primary-button" disabled={busy} type="button" onClick={() => void approve()}>{busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}{busy ? "Creating draft" : "Approve & create draft"}</button>
                    <button className="text-button" disabled={busy} type="button" onClick={() => { setResult(null); setDraft(null); setStatus({ tone: "success", text: "Mockup rejected · adjust the setup and generate again" }); }}>Reject mockup</button>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-preview">
                <div><ImageIcon size={28} /></div>
                <strong>Your mockup will appear here</strong>
                <span>Complete the setup and generate a preview before anything reaches Shopify.</span>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
