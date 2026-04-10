import { execute, queryFirst } from "../../shared/db";
import { getDataHealthSnapshot } from "../../shared/dataContracts";
import { hashPassword, requireToken, signToken } from "../../shared/auth";
import { getMockCalibration, getMockSlate } from "../../shared/mockData";
import { jsonWithSourceMeta } from "../../shared/sourceMeta";
import type { CalibrationRow, Env } from "../../shared/types";
import { handleAutoBetRequest } from "../../mlb-autobet/src/index";
import { handleGameContextRequest, MLB_LIVE_SYNC_PROFILE, syncMlbLiveGames } from "../../mlb-game-context/src/index";
import { handleLineupsRequest } from "../../mlb-lineups/src/index";
import { handleMarketMakerRequest } from "../../mlb-market-maker/src/index";
import { handleResearchRequest } from "../../mlb-research/src/index";
import { handleRiskEngineRequest } from "../../mlb-risk-engine/src/index";
import { handleScheduleRequest, syncMlbScoreboardOdds } from "../../mlb-schedule/src/index";
import { handleSimRequest } from "../../mlb-sim/src/index";
import { handleOptions, json, notFound, parseDate, withError } from "../../shared/utils";

function isBillingBypassed(env: Env): boolean {
  return (env.SSA_BILLING_BYPASS || "").toLowerCase() === "true";
}

async function handleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/auth/signup" && request.method === "POST") {
    const { email, password } = (await request.json()) as { email: string; password: string };
    const passwordHash = await hashPassword(password, env);

    if (env.DB) {
      await execute(
        env,
        "INSERT INTO users (email, password_hash, is_admin, created_at) VALUES (?, ?, ?, datetime('now'))",
        [email, passwordHash, email.endsWith("@sportssenseai.local") ? 1 : 0]
      );
    }

    const token = await signToken(
      {
        email,
        is_admin: email.endsWith("@sportssenseai.local"),
        created_at: new Date().toISOString()
      },
      env
    );

    return json({ token }, 200, env);
  }

  if (path === "/auth/login" && request.method === "POST") {
    const { email, password } = (await request.json()) as { email: string; password: string };
    const passwordHash = await hashPassword(password, env);
    const dbUser =
      (await queryFirst<{ email: string; password_hash: string; is_admin: number }>(
        env,
        "SELECT email, password_hash, is_admin FROM users WHERE email = ? LIMIT 1",
        [email]
      )) || null;

    if (dbUser && dbUser.password_hash !== passwordHash) {
      return json({ error: "Invalid credentials" }, 401, env);
    }

    const token = await signToken(
      {
        email,
        is_admin: dbUser ? Boolean(dbUser.is_admin) : email.endsWith("@sportssenseai.local"),
        created_at: new Date().toISOString()
      },
      env
    );

    return json({ token }, 200, env);
  }

  if (path === "/auth/me" && request.method === "GET") {
    const payload = await requireToken(request, env);
    if (!payload) {
      return json({ error: "Unauthorized" }, 401, env);
    }
    return json(payload, 200, env);
  }

  return notFound("Auth route not found", env);
}

async function handleBilling(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const billingBypassed = isBillingBypassed(env);

  if (path === "/billing/status") {
    if (billingBypassed) {
      return json(
        {
          tier: "launch-bypass",
          status: "billing_bypassed",
          billing_enabled: false,
          can_checkout: false,
          app: "SportsSenseAi",
          message: "Billing is bypassed for launch while Stripe accounting validation is pending."
        },
        200,
        env
      );
    }

    return json(
      {
        tier: "pro-preview",
        status: env.STRIPE_SECRET_KEY ? "configured" : "pending_credentials",
        billing_enabled: Boolean(env.STRIPE_SECRET_KEY),
        can_checkout: Boolean(env.STRIPE_SECRET_KEY),
        app: "SportsSenseAi"
      },
      200,
      env
    );
  }

  if (path === "/billing/create-checkout-session" && request.method === "POST") {
    if (billingBypassed) {
      return json(
        {
          ok: true,
          bypassed: true,
          billing_enabled: false,
          checkout_url: null,
          message: "Billing is temporarily bypassed for launch. Enable Stripe after accounting validation is complete."
        },
        200,
        env
      );
    }

    if (!env.STRIPE_SECRET_KEY) {
      return json(
        {
          ok: false,
          message: "Stripe credentials are not configured yet.",
          next_step: "Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Cloudflare secrets."
        },
        501,
        env
      );
    }

    return json({ ok: true, checkout_url: "https://checkout.stripe.com/test-session" }, 200, env);
  }

  return notFound("Billing route not found", env);
}

async function handleAiGateway(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, env);
  }

  const { question } = (await request.json()) as { question: string };
  const date = parseDate(new URL(request.url).searchParams.get("date"));
  const slate = getMockSlate(date)
    .filter((row) => row.type === "batter")
    .slice(0, 3)
    .map((row) => `${row.player_name}: HRH 2+ ${Math.round(row.P_hrh_2p * 100)}%, score ${row.compositeScore}`)
    .join("; ");
  const gatewayToken = env.SSA_CF_AIG_TOKEN || env.CF_AIG_TOKEN;
  const byokAlias = env.SSA_CF_AIG_BYOK_ALIAS?.trim();

  if (!gatewayToken) {
    return json(
      {
        answer: `SportsSenseAi Q&A is in safe fallback mode. Top model signals for ${date}: ${slate}. Question received: ${question}`
      },
      200,
      env
    );
  }

  try {
    const headers: Record<string, string> = {
      "cf-aig-authorization": `Bearer ${gatewayToken}`,
      "content-type": "application/json"
    };

    if (byokAlias) {
      headers["cf-aig-byok-alias"] = byokAlias;
    }

    const response = await fetch(
      "https://gateway.ai.cloudflare.com/v1/71c315a0acd5896e9ca591df7d3e188b/fca-ai-gateway/openai/chat/completions",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: (env.OPENAI_MODEL || "openai/gpt-4.1").replace(/^openai\//, ""),
          messages: [
            {
              role: "system",
              content:
                "You are SportsSenseAi's MLB analysis assistant. Use only the provided slate context, describe probabilities and model outputs, and never guarantee outcomes."
            },
            {
              role: "user",
              content: `Question: ${question}\nContext: ${slate}`
            }
          ]
        })
      }
    );

    const payload = (await response.json()) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    };

    if (!response.ok) {
      throw new Error(payload.error?.message || `AI Gateway request failed with status ${response.status}`);
    }

    const content = payload.choices
      ?.map((choice) => choice.message?.content || "")
      .filter(Boolean)
      .join("\n")
      .trim();

    return json({ answer: content || "No answer returned." }, 200, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AI Gateway error";
    return json(
      {
        answer: `SportsSenseAi Q&A is temporarily using fallback mode. Top model signals for ${date}: ${slate}. Question received: ${question}`,
        warning: message
      },
      200,
      env
    );
  }
}

async function handleAdminDataHealth(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, env);
  }

  const snapshot = await getDataHealthSnapshot(env);
  return jsonWithSourceMeta(
    request,
    snapshot,
    {
      route: "/admin/mlb/data-health",
      source: "db_audit",
      tables: snapshot.tables.map((table) => table.table),
      notes: "Internal audit snapshot for D1 coverage, mock risk, and route-to-source verification."
    },
    200,
    env
  );
}

async function runLiveSync(env: Env, dateParam?: string | null, gameId?: string | null) {
  const date = parseDate(dateParam);
  const scoreboard = await syncMlbScoreboardOdds(env, date, {
    gameIds: gameId ? [gameId] : undefined,
    liveOpsOnly: !gameId,
    now: new Date()
  });
  const targetGameIds = gameId ? [gameId] : scoreboard.liveGames.map((game) => game.gameId);
  const live = targetGameIds.length > 0 ? await syncMlbLiveGames(env, targetGameIds) : { synced_at: new Date().toISOString(), inserted: 0, games: [] };

  return {
    date,
    scoreboard,
    targetGameIds,
    live
  };
}

async function handleAdminLiveSync(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, env);
  }

  const url = new URL(request.url);
  const gameId = url.searchParams.get("game_id");
  const sync = await runLiveSync(env, url.searchParams.get("date"), gameId);

  return jsonWithSourceMeta(
    request,
    {
      date: sync.date,
      test_game_id: gameId,
      target_game_ids: sync.targetGameIds,
      polling: MLB_LIVE_SYNC_PROFILE,
      scoreboard: {
        discovered_games: sync.scoreboard.discoveredGames.length,
        synced_games: sync.scoreboard.games.length,
        live_games: sync.scoreboard.liveGames.map((game) => ({
          gameId: game.gameId,
          status: game.status,
          summary: game.summary,
          startTime: game.startTime,
          teams: {
            away: game.teams.away.abbreviation,
            home: game.teams.home.abbreviation
          }
        })),
        odds_snapshots_attempted: sync.scoreboard.oddsSnapshotsAttempted,
        odds_snapshots_persisted: sync.scoreboard.oddsSnapshotsPersisted
      },
      live_sync: sync.live
    },
    {
      route: "/admin/mlb/live-sync",
      source: "external_plus_db",
      tables: ["mlb_odds", "mlb_odds_history", "mlb_live"],
      notes:
        "Internal live-ops route that discovers live MLB games from ESPN, persists scoreboard odds snapshots, and writes summary snapshots into mlb_live.",
      breakdown: {
        target_games: sync.targetGameIds.length,
        live_rows_inserted: sync.live.inserted,
        odds_snapshots_persisted: sync.scoreboard.oddsSnapshotsPersisted
      }
    },
    200,
    env
  );
}

async function handleScheduledLiveSync(controller: ScheduledController, env: Env): Promise<void> {
  const scheduledDate = new Date(controller.scheduledTime).toISOString().slice(0, 10);
  const sync = await runLiveSync(env, scheduledDate, null);

  console.log(
    JSON.stringify({
      worker: "router",
      type: "mlb_live_sync",
      scheduled_for: new Date(controller.scheduledTime).toISOString(),
      date: sync.date,
      target_games: sync.targetGameIds,
      live_rows_inserted: sync.live.inserted,
      odds_snapshots_persisted: sync.scoreboard.oddsSnapshotsPersisted
    })
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const optionsResponse = handleOptions(request, env);
    if (optionsResponse) {
      return optionsResponse;
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/health") {
        const calibrationRow = await queryFirst<CalibrationRow>(
          env,
          "SELECT date, prop_type, bucket, proj_avg, actual_avg, count FROM mlb_calibration ORDER BY date DESC LIMIT 1"
        );
        const healthData = calibrationRow || getMockCalibration(parseDate(url.searchParams.get("date")))[0];
        const source = calibrationRow ? "db" : "mock";

        return jsonWithSourceMeta(
          request,
          {
            ok: true,
            app: "SportsSenseAi",
            worker: "router",
            db_bound: Boolean(env.DB),
            latest_calibration: healthData
          },
          {
            route: "/health",
            source,
            tables: ["mlb_calibration"],
            notes: source === "db" ? "Latest calibration row resolved from D1." : "Returned seeded calibration fallback."
          },
          200,
          env
        );
      }

      if (path.startsWith("/auth")) return handleAuth(request, env);
      if (path === "/admin/mlb/data-health") return handleAdminDataHealth(request, env);
      if (path === "/admin/mlb/live-sync") return handleAdminLiveSync(request, env);
      if (path.startsWith("/billing")) return handleBilling(request, env);
      if (path.startsWith("/project/mlb") || path.startsWith("/schedule/mlb") || path.startsWith("/games/mlb")) {
        return handleScheduleRequest(request, env);
      }
      if (path.startsWith("/lineups/mlb")) return handleLineupsRequest(request, env);
      if (
        path.startsWith("/game/mlb") ||
        path.startsWith("/player/mlb") ||
        path.startsWith("/live/mlb") ||
        path.startsWith("/game-context/mlb") ||
        path.startsWith("/admin/mlb/health-data")
      ) {
        return handleGameContextRequest(request, env);
      }
      if (path.startsWith("/sim/mlb")) return handleSimRequest(request, env);
      if (path.startsWith("/market/mlb")) return handleMarketMakerRequest(request, env);
      if (path.startsWith("/research/mlb")) return handleResearchRequest(request, env);
      if (path.startsWith("/risk/mlb")) return handleRiskEngineRequest(request, env);
      if (path.startsWith("/autobet/mlb")) return handleAutoBetRequest(request, env);
      if (path.startsWith("/mlb/qa")) return handleAiGateway(request, env);

      return notFound("SportsSenseAi route not found", env);
    } catch (error) {
      return withError(error, env);
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      handleScheduledLiveSync(controller, env).catch((error) => {
        console.error("Scheduled MLB live sync failed", error);
      })
    );
  }
};
