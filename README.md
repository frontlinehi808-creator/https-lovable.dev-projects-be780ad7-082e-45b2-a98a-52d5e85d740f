# Frontline Operator — Printful approval connection

This app reuses the Printful backend and cached catalog from `lovabld-artisan-studio`. It generates a mockup and stops for manual approval. It does not publish to Shopify.

## Secret placement

Store the Printful token only in Supabase project `lrkvfuovgifdskgcxtgq` under **Edge Functions → Secrets** with the exact name `PRINTFUL_API_KEY`. Never put it in this repository, `.env`, or a `VITE_` variable.

The browser contains only the public Supabase URL and publishable key. The included Edge Function requires a valid Supabase user session and allows only store lookup and mockup-generator endpoints.

## Workflow

1. Sign in as an authorized operator.
2. Use Artisan Studio's existing `/printful` page to refresh cached products when needed.
3. Upload artwork, choose the cached product and placement, and generate the mockup.
4. Approve or reject manually. Shopify publishing remains intentionally disconnected.
