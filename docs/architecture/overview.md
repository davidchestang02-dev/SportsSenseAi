# SportsSenseAi Architecture

SportsSenseAi is organized into four launch-facing layers:

1. `backend/workers`: Cloudflare Worker endpoints for MLB projections, context, simulation, pricing, risk, auto-bet, auth, billing status, and AI Q&A.
2. `backend/modeling`: Python modules that turn baseball context into player, team, game, and slate outputs.
3. `web`, `admin`, and `mobile`: operator and user-facing clients.
4. `tests` and `.github/workflows`: release guardrails.

The repo currently supports a launch-ready mock/data-fallback mode so every surface can run before live credentials are attached.
