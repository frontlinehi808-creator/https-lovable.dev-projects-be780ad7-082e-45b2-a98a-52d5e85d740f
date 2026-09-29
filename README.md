# Design Drop / Frontline Operator

Design Drop opens with an image cleaner: **choose image → clean image → preview result → save/download cleaned image**. The existing private Frontline Operator production desk remains available through the Printful / Shopify workspace button.

## Image cleaner

- Select one PNG or JPG (up to 20 MB and 12 megapixels). Small images are allowed; the separate production desk retains its 800 × 800 minimum.
- Click **Clean image** to remove white or near-white background connected to the edges. Adjust strength and clean again if needed. Enclosed light details are preserved, but light artwork touching the perimeter can be removed: always review the before/after previews.
- Click **Save / download cleaned PNG** to export the preview as a transparent PNG at the original pixel dimensions. On iPhone, use Share → Save to Files if the browser opens the image.
- Processing happens on the device. Originals are not uploaded or overwritten. The cleaner needs no account, provider credentials, database, or new Supabase project. Preview URLs last only for the current session; download to keep the result.
- This is conservative light-background removal, not AI retouching, dark-background removal, upscaling, or verified print preparation. Photos and textured backgrounds may need a different cleaner.

Opening the production desk does not automatically send the cleaned image to it. To use the cleaned PNG there, download it and select that file in the existing artwork upload. Production sign-in and approval gates remain intact. Switching workspaces retains in-progress work until reload.

## Production workflow (preserved)

1. Sign in with an authorized Supabase account.
2. Name a collection and choose a baby, kids, parent, matching-family, or accessory role.
3. Upload one or several PNG or JPG images (20 MB maximum each, at least 800 × 800 px) and select the artwork for the next product.
4. Choose a connected Printful store, cached product variant, and placement.
5. Generate and review the Printful mockup.
6. Approve it to create an unpublished Shopify draft with the collection story and role.
7. Review and publish manually in Shopify.

The app never publishes a Shopify product automatically.

## Local development

```bash
npm install
npm run dev
```

For the production desk, copy `.env.example` to `.env.local` and supply the public Supabase URL and publishable key. The image cleaner works without these variables. Never put provider credentials in browser-visible `VITE_` variables.

## Supabase configuration

The app currently uses Supabase project `lrkvfuovgifdskgcxtgq`. Configure these provider credentials only under **Edge Functions → Secrets**:

- `PRINTFUL_API_KEY`
- `SHOPIFY_STORE_DOMAIN` (for example `your-store.myshopify.com`)
- `SHOPIFY_ADMIN_ACCESS_TOKEN` (custom app token with `write_products`)

The `printful-designs` storage bucket and `printful_products` table must allow authenticated operator access. Disable public Supabase signups or otherwise restrict account creation so only approved operators can obtain a valid session.

The existing production desk uses these edge functions (no function changes are needed for the cleaner):

- `printful`
- `shopify-draft`

## Validation

```bash
npm run lint
npm test
npm run build
```

Provider staging still requires valid Printful, Shopify, and Supabase credentials. Use a test product and confirm that approval produces a Shopify product with `DRAFT` status before production use.

Cleaner coverage includes pixel-level removal and preservation, file and dimension limits, PNG encoding failures, file selection, preview/export, stale-result invalidation, retry, and workspace switching. Before deployment, review the branch and manually check one real PNG/JPG plus an iPhone download. This restoration is a frontend-only change and requires no backend migration or new secrets. Merge and publish only after review.
