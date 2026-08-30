# Frontline Operator — Printful to Shopify approval workflow

This app reuses the Printful backend and cached catalog from `lovabld-artisan-studio`. It generates a mockup, stops for manual approval, and creates a Shopify draft after approval. It never publishes automatically.

## Secret placement

Store these only in Supabase project `lrkvfuovgifdskgcxtgq` under **Edge Functions → Secrets**. Never put them in this repository, `.env`, or a `VITE_` variable.

- `PRINTFUL_API_KEY`
- `SHOPIFY_STORE_DOMAIN` (for example `your-store.myshopify.com`)
- `SHOPIFY_ADMIN_ACCESS_TOKEN` (custom app token with `write_products`)

The browser contains only the public Supabase URL and publishable key. The included Edge Function requires a valid Supabase user session and allows only store lookup and mockup-generator endpoints.

## Workflow

1. Sign in as an authorized operator.
2. Use Artisan Studio's existing `/printful` page to refresh cached products when needed.
3. Upload artwork, choose the cached product and placement, and generate the mockup.
4. Approve or reject manually. Approval creates a Shopify draft with automatic pricing, story, sizes, colors, and the approved mockup.
5. Review and publish the draft yourself in Shopify.
