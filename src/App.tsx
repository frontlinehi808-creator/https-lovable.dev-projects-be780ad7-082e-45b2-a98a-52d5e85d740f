import { lazy, Suspense, useState } from "react";
import ImageCleaner from "./ImageCleaner";

const ProductionDesk = lazy(() => import("./ProductionDesk").catch(() => ({
  default: function ProductionLoadError() {
    return <p role="alert" className="status status-error">The production desk could not load. Check its existing Supabase browser configuration and reload. Image cleaning is still available.</p>;
  },
})));

export default function App() {
  const [production, setProduction] = useState(false);
  const [visitedProduction, setVisitedProduction] = useState(false);
  return <>
    <nav className="workspace-switcher" aria-label="Workspaces">
      <button type="button" aria-pressed={!production} onClick={() => setProduction(false)}>Design Drop · image cleaner</button>
      <button type="button" aria-pressed={production} onClick={() => { setProduction(true); setVisitedProduction(true); }}>Printful / Shopify production desk</button>
    </nav>
    <div hidden={production}><ImageCleaner /></div>
    {visitedProduction && <div hidden={!production}><Suspense fallback={<p role="status">Loading production desk…</p>}><ProductionDesk /></Suspense></div>}
  </>;
}
