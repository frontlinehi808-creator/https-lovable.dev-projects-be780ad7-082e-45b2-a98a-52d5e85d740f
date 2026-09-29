import { useEffect, useState } from "react";
import { Download, ImageIcon, LoaderCircle } from "lucide-react";
import { cleanImage } from "./lib/clean-image";
import type { CleanedImage } from "./lib/clean-image";
import { cleanedFileName, validateCleanerFile } from "./lib/cleaner";
import { getErrorMessage } from "./lib/workflow";

function usePreview(blob: Blob | null) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) { setUrl(""); return; }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

export default function ImageCleaner() {
  const [file, setFile] = useState<File | null>(null);
  const [tolerance, setTolerance] = useState(20);
  const [result, setResult] = useState<CleanedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const originalUrl = usePreview(file);
  const resultUrl = usePreview(result?.blob ?? null);

  function choose(next: File) {
    setResult(null);
    const validation = validateCleanerFile(next);
    setError(validation ?? "");
    setFile(validation ? null : next);
  }

  async function clean() {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try { setResult(await cleanImage(file, tolerance)); }
    catch (failure) { setError(getErrorMessage(failure, "Could not clean the image. Try again.")); }
    finally { setBusy(false); }
  }

  return (
    <main className="workspace cleaner-workspace">
      <header className="topbar"><div><p className="eyebrow">Design Drop</p><h1>Clean it. Save it.</h1></div><ImageIcon aria-hidden="true" /></header>
      <p>Choose an image, remove its light background, preview it, and save a transparent PNG.</p>
      <ol className="stepper" aria-label="Image cleaning progress">
        {["Choose image", "Clean image", "Preview", "Save"].map((label, index) => <li key={label} className={index === (result ? 3 : file ? 1 : 0) ? "current" : ""}><span>{index + 1}</span>{label}</li>)}
      </ol>
      <section className="cleaner-controls" aria-label="Image cleanup">
        <div className="field-group">
          <label htmlFor="cleaner-file">Choose image</label>
          <input id="cleaner-file" type="file" accept="image/png,image/jpeg" disabled={busy} onChange={(event) => {
            const next = event.target.files?.[0];
            if (next) choose(next);
            event.target.value = "";
          }} />
          {file && <small>Selected: {file.name}</small>}
          <small>PNG or JPG · up to 20 MB and 12 megapixels. Your image stays on your device.</small>
        </div>
        <div className="field-group">
          <label htmlFor="cleaner-strength">Light background strength: {tolerance}</label>
          <input id="cleaner-strength" type="range" min="0" max="80" value={tolerance} disabled={busy} onChange={(event) => { setTolerance(Number(event.target.value)); setResult(null); }} />
          <small>Higher removes more off-white background. Light areas connected to the image edges may also be removed.</small>
        </div>
        <button className="primary-button" type="button" disabled={!file || busy} onClick={() => void clean()}>{busy && <LoaderCircle className="spin" size={18} aria-hidden="true" />}{busy ? "Cleaning image…" : "Clean image"}</button>
      </section>
      {error && <p className="status status-error" role="alert">{error}</p>}
      <p role="status" aria-live="polite">{busy ? "Cleaning your image" : result ? result.removed ? "Cleaned image ready. Review the preview before saving." : "No light edge background found. The exported PNG keeps the artwork as shown." : file ? `${file.name} selected. Ready to clean.` : "Choose an image to begin."}</p>
      <div className="cleaner-previews">
        <section aria-label="Original image"><h2>Original</h2><div className="cleaner-stage">{originalUrl ? <img src={originalUrl} alt="Original artwork" /> : <p>Your original image will appear here.</p>}</div></section>
        <section aria-label="Cleaned image"><h2>Cleaned preview</h2><div className="cleaner-stage">{result && resultUrl ? <img src={resultUrl} alt="Cleaned artwork with transparent background" /> : <p>Clean your image to see the result.</p>}</div></section>
      </div>
      {result && resultUrl && file && <div className="cleaner-save">
        <p>{result.width} × {result.height} px · transparent PNG · original dimensions preserved</p>
        <a className="primary-button" href={resultUrl} download={cleanedFileName(file.name)}><Download size={18} aria-hidden="true" />Save / download cleaned PNG</a>
        <p>On iPhone, if the image opens instead of downloading, use Share → Save to Files.</p>
      </div>}
      <p className="cleaner-note">This removes white and near-white backgrounds connected to the edges. It does not redraw, upscale, remove dark backgrounds, or certify print readiness. Enclosed light details stay intact; review delicate edge details before saving.</p>
    </main>
  );
}
