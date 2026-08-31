# Frontline Operator

Frontline Operator is the private Design Drop production desk. It takes approved artwork through a Printful mockup, pauses for operator review, and creates an unpublished Shopify draft only after explicit approval.

## Workflow

1. Sign in with an authorized Supabase account.
2. Upload a PNG or JPG (20 MB maximum, at least 800 × 800 px).
3. Choose a connected Printful store, cached product variant, and placement.
4. Generate and review the Printful mockup.
5. Approve the mockup to create an unpublished Shopify draft.
6. Review and publish manually in Shopify.

The app never publishes a Shopify product automatically.

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and supply the public Supabase URL and publishable key. Never put provider credentials in browser-visible `VITE_` variables.

## Supabase configuration

The app currently uses Supabase project `lrkvfuovgifdskgcxtgq`. Configure these provider credentials only under **Edge Functions → Secrets**:

- `PRINTFUL_API_KEY`
- `SHOPIFY_STORE_DOMAIN` (for example `your-store.myshopify.com`)
- `SHOPIFY_ADMIN_ACCESS_TOKEN` (custom app token with `write_products`)

The `printful-designs` storage bucket and `printful_products` table must allow authenticated operator access. Disable public Supabase signups or otherwise restrict account creation so only approved operators can obtain a valid session.

Deploy both edge functions after changes:

- `printful`
- `shopify-draft`

## Validation

```bash
npm run lint
npm test
npm run build
```

Provider staging still requires valid Printful, Shopify, and Supabase credentials. Use a test product and confirm that approval produces a Shopify product with `DRAFT` status before production use.
