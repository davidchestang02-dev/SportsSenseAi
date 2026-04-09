# Launch Guide

Infrastructure required for launch:

1. Cloudflare Worker deployment with D1, KV, and R2 bound.
2. Environment secrets for auth, Cloudflare AI Gateway, and optional Stripe.
3. Cloudflare Pages project for `frontend/`.
4. Optional internal hosting plan for `admin/` while it remains Streamlit-based.
5. Expo credentials for OTA or store builds.

Minimum launch sequence:

1. Apply [`backend/schema/d1_schema.sql`](../../backend/schema/d1_schema.sql).
2. Set Worker secrets and vars, including `SSA_CF_AIG_TOKEN` or `CF_AIG_TOKEN`.
3. From `frontend/`, run `npm install` and `npm run build`.
4. Create the `sportssenseai-web` Pages project and bind the `SSA_API` service or `SSA_API_BASE` variable from [`frontend/wrangler.toml`](../../frontend/wrangler.toml).
5. Deploy the public site with `npx wrangler pages deploy dist --project-name sportssenseai-web`.
6. Point `EXPO_PUBLIC_SSA_API_BASE` at the deployed API.
7. Run `python -m pytest tests`.
8. Deploy Workers with `npx wrangler deploy --env staging` and `npx wrangler deploy --env production`.
9. Keep `admin/` private until it receives its own Cloudflare-native UI, then deploy mobile.

Secrets bootstrap:

- Put real values in `backend/.dev.vars`
- Run `powershell -ExecutionPolicy Bypass -File backend/scripts/sync-wrangler-secrets.ps1`
- This pushes `AUTH_SECRET`, `SSA_CF_AIG_TOKEN`, `CF_AIG_TOKEN`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` to default, staging, and production

Launch-safe billing bypass:

- `SSA_BILLING_BYPASS=true` is enabled in `backend/wrangler.toml` for default, staging, and production.
- This keeps `/billing/status` and `/billing/create-checkout-session` non-blocking while Stripe account validation is pending.
- To enable real billing later, set `SSA_BILLING_BYPASS=false`, add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, then redeploy.

Known external dependencies that still require real credentials:

- Cloudflare account resources
- Cloudflare AI Gateway token for live AI Q&A
- Stripe keys if billing should be active on day one
- Expo token if OTA automation should run from GitHub
- GitHub Actions secret `SSA_CF_API_TOKEN` for automated Workers, D1, and Pages deploys

Cloudflare Pages deployment:

- `frontend/` is the production public site.
- `frontend/functions/api/[[path]].js` proxies browser requests to the live backend Worker through a Pages Function.
- `frontend/public/_routes.json` is the correct routing file for Pages. Cloudflare does not use a `pages.json` route file here.
- `frontend/wrangler.toml` declares the Pages output directory plus production and preview backend bindings.
- `frontend-python-worker/` is available if you later want Python edge logic, but Pages Functions remain JavaScript/TypeScript.

AI Q&A route:

- Base URL: `https://gateway.ai.cloudflare.com/v1/71c315a0acd5896e9ca591df7d3e188b/fca-ai-gateway/openai/chat/completions`
- Default model: `openai/gpt-4.1`
- Auth header: `cf-aig-authorization: Bearer <gateway-token>`
- Secret supported by the Worker: `SSA_CF_AIG_TOKEN` or `CF_AIG_TOKEN`
- Optional key alias header: `cf-aig-byok-alias`
- Env var for non-default provider keys: `SSA_CF_AIG_BYOK_ALIAS`
