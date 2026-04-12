import OpenAI from "openai";
import { execute, queryAll, queryFirst } from "../../shared/db";
import { getDataHealthSnapshot } from "../../shared/dataContracts";
import { hashPassword, requireToken, signToken } from "../../shared/auth";
import { getMockCalibration, getMockSlate } from "../../shared/mockData";
import type { CalibrationRow, Env } from "../../shared/types";
import { handleAutoBetRequest } from "../../mlb-autobet/src/index";
import { handleGameContextRequest, MLB_LIVE_SYNC_PROFILE, syncMlbLiveGames } from "../../mlb-game-context/src/index";
import { handleLineupsRequest } from "../../mlb-lineups/src/index";
import { handleMarketMakerRequest } from "../../mlb-market-maker/src/index";
import { handlePitchersRequest } from "../../mlb-pitchers/src/index";
import { handlePregameRequest, syncPregameSlate } from "../../mlb-pregame/src/index";
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

  console.log("CF_AIG_TOKEN exists:", !!env.CF_AIG_TOKEN);

  const { question } = (await request.json()) as { question: string };
  const date = parseDate(new URL(request.url).searchParams.get("date"));
  const slate = getMockSlate(date)
    .filter((row) => row.type === "batter")
    .slice(0, 3)
    .map((row) => `${row.player_name}: HRH 2+ ${Math.round(row.P_hrh_2p * 100)}%, score ${row.compositeScore}`)
    .join("; ");

  if (!env.CF_AIG_TOKEN) {
    return json(
      {
        answer: `SportsSenseAi Q&A is in safe fallback mode. Top model signals for ${date}: ${slate}. Question received: ${question}`
      },
      200,
      env
    );
  }

  try {
    const client = new OpenAI({
      apiKey: env.SSA_CF_AIG_TOKEN,
      baseURL: "https://gateway.ai.cloudflare.com/v1/71c315a0acd5896e9ca591df7d3e188b/fca-ai-gateway/compat"
    });

    const response = await client.chat.completions.create({
      model: env.OPENAI_MODEL || "openai/gpt-4.1",
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
    });

    const content = response.choices
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

async function handleDataHealth(request: Request, env: Env): Promise<Response> {
  return json(await getDataHealthSnapshot(env), 200, env);
}

async function handleLiveSync(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const date = parseDate(url.searchParams.get("date"));
  const scoreboardSync = await syncMlbScoreboardOdds(env, date, { liveOpsOnly: true });
  const liveGameIds = scoreboardSync.games.filter((game) => game.status === "IN_PROGRESS").map((game) => game.gameId);
  const liveSync = liveGameIds.length > 0 ? await syncMlbLiveGames(env, liveGameIds) : { synced_at: new Date().toISOString(), inserted: 0, games: [] };

  return json(
    {
      date,
      polling: MLB_LIVE_SYNC_PROFILE,
      scoreboard: {
        discovered_games: scoreboardSync.discoveredGames.length,
        eligible_games: scoreboardSync.games.length,
        live_games: scoreboardSync.liveGames.length,
        odds_snapshots_persisted: scoreboardSync.oddsSnapshotsPersisted
      },
      live: liveSync
    },
    200,
    env
  );
}

function formatEtDate(date: Date, dayOffset = 0): string {
  const base = new Date(date.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(base);
}

function etClock(date: Date): { hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  });
  const [hour, minute] = formatter.format(date).split(":").map((value) => Number(value));
  return { hour, minute };
}

async function runScheduledMlbOps(env: Env, scheduledTime: number) {
  const now = new Date(scheduledTime);
  const { hour, minute } = etClock(now);
  const todayEt = formatEtDate(now);
  const previousEt = formatEtDate(now, -1);

  const liveScoreboard = await syncMlbScoreboardOdds(env, todayEt, { liveOpsOnly: true });
  const liveGameIds = liveScoreboard.games.filter((game) => game.status === "IN_PROGRESS").map((game) => game.gameId);
  const recentTrackedRows =
    (await queryAll<{ game_id: string }>(
      env,
      "SELECT DISTINCT game_id FROM mlb_live WHERE created_at >= datetime('now', '-10 minutes')"
    )) || [];
  const recentTrackedIds = new Set(recentTrackedRows.map((row) => row.game_id));
  const recentFinalIds = liveScoreboard.discoveredGames
    .filter((game) => game.status === "FINAL" && recentTrackedIds.has(game.gameId))
    .map((game) => game.gameId);
  const syncIds = [...new Set([...liveGameIds, ...recentFinalIds])];
  if (syncIds.length > 0) {
    await syncMlbLiveGames(env, syncIds);
  }

  if (hour === 11 && minute === 0) {
    await syncPregameSlate(env, todayEt);
  }

  if (hour === 3 && minute === 0) {
    await syncMlbScoreboardOdds(env, previousEt, { shouldPersistGame: (game) => game.status === "FINAL" });
  }
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
      if (path === "/") {
        return json(
          {
            ok: true,
            app: "SportsSenseAi",
            worker: "router",
            routes: {
              schedule: "/schedule/mlb",
              pregame: "/pregame/mlb",
              weather: "/weather/mlb",
              pitchers: "/pitchers/mlb",
              gamecast: "/games/mlb/:gameId/gamecast"
            }
          },
          200,
          env
        );
      }

      if (path === "/health") {
        const healthData =
          (await queryFirst<CalibrationRow>(
            env,
            "SELECT date, prop_type, bucket, proj_avg, actual_avg, count FROM mlb_calibration ORDER BY date DESC LIMIT 1"
          )) || getMockCalibration(parseDate(url.searchParams.get("date")))[0];

        return json(
          {
            ok: true,
            app: "SportsSenseAi",
            worker: "router",
            db_bound: Boolean(env.DB),
            latest_calibration: healthData
          },
          200,
          env
        );
      }

      if (path.startsWith("/auth")) return handleAuth(request, env);
      if (path.startsWith("/billing")) return handleBilling(request, env);
      if (path.startsWith("/pregame/mlb") || path.startsWith("/weather/mlb") || path.startsWith("/admin/mlb/pregame-sync") || path.startsWith("/admin/mlb/statcast-sync")) {
        return handlePregameRequest(request, env);
      }
      if (path.startsWith("/games/mlb/") && path.endsWith("/preview")) return handlePregameRequest(request, env);
      if (path.startsWith("/pitchers/mlb") || path.startsWith("/admin/mlb/pitchers/sync")) return handlePitchersRequest(request, env);
      if (path.startsWith("/research/mlb")) return handleResearchRequest(request, env);
      if (path.startsWith("/admin/mlb/data-health")) return handleDataHealth(request, env);
      if (path.startsWith("/admin/mlb/live-sync")) return handleLiveSync(request, env);
      if (path.startsWith("/project/mlb") || path.startsWith("/schedule/mlb")) return handleScheduleRequest(request, env);
      if (path.startsWith("/games/mlb/") && path.endsWith("/gamecast")) return handleGameContextRequest(request, env);
      if (path.startsWith("/games/mlb/")) return handleScheduleRequest(request, env);
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
      if (path.startsWith("/risk/mlb")) return handleRiskEngineRequest(request, env);
      if (path.startsWith("/autobet/mlb")) return handleAutoBetRequest(request, env);
      if (path.startsWith("/mlb/qa")) return handleAiGateway(request, env);

      return notFound("SportsSenseAi route not found", env);
    } catch (error) {
      return withError(error, env);
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledMlbOps(env, controller.scheduledTime));
  }
};
