# SportsSenseAi Cloudflare Pages Frontend

`frontend/` is the production customer-facing web app for SportsSenseAi.

## Folder Structure

```text
frontend/
  functions/
    api/
      [[path]].js        # Pages Function proxy for the Workers backend
  public/
    _headers             # Pages response headers
    _redirects           # SPA route fallback for client-side navigation
    _routes.json         # Limits Functions execution to /api/*
    favicon.svg
  src/
    api.js               # Browser API client
    dashboardData.js     # Shared slate data loading
    media.js             # Team branding and player portrait helpers
    pages.jsx            # Routed product pages
    ui.jsx               # Shared UI primitives
    App.jsx              # Main application shell and routing
    main.jsx             # React bootstrap
    styles.css           # Premium brand styling
  index.html
  package.json
  vite.config.js
  wrangler.toml
```

## Build Command

```powershell
cd frontend
npm install
npm run build
```

## Cloudflare Pages Commands

Local preview:

```powershell
cd frontend
npm run build
npm run pages:dev
```

Deploy:

```powershell
cd frontend
npm run build
npm run pages:deploy
```

## Important Notes

- Cloudflare Pages routing uses `public/_routes.json`. There is no official `pages.json` routing file for this setup.
- The public app now includes separate routes for landing, command center, players, games, markets, and lineups.
- `functions/` must stay JavaScript or TypeScript on Pages. Python edge logic belongs in the separate `frontend-python-worker/` scaffold.
