import { execute, queryAll } from "../../shared/db";
import { buildAutoBetSlips, buildPortfolioRecommendations } from "../../shared/portfolioEngine";
import { jsonWithSourceMeta } from "../../shared/sourceMeta";
import type { Env, MarketRow } from "../../shared/types";
import { methodNotAllowed, parseDate, round, withError } from "../../shared/utils";

const MARKET_QUERY =
  "SELECT date, game_id, player_id, player_name, team, prop_type, fair_probability, fair_american, posted_american, best_book, edge, confidence FROM mlb_market_views WHERE date = ? ORDER BY edge DESC, confidence DESC, fair_probability DESC";

async function loadMarketViews(env: Env, date: string): Promise<MarketRow[]> {
  return (await queryAll<MarketRow>(env, MARKET_QUERY, [date])) || [];
}

async function persistAutoBetRun(env: Env, date: string, bankroll: number, totalSlips: number, totalExposure: number): Promise<boolean> {
  return execute(env, "INSERT INTO mlb_autobet_runs (date, bankroll, total_slips, total_exposure) VALUES (?, ?, ?, ?)", [
    date,
    bankroll,
    totalSlips,
    round(totalExposure, 2)
  ]);
}

export async function handleAutoBetRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return methodNotAllowed(env);
  }

  try {
    const url = new URL(request.url);
    const body = request.method === "POST" ? ((await request.json()) as { bankroll?: number; date?: string }) : null;
    const date = parseDate(body?.date || url.searchParams.get("date"));
    const bankroll =
      request.method === "POST" ? Number(body?.bankroll || env.SSA_DEFAULT_BANKROLL || 1000) : Number(env.SSA_DEFAULT_BANKROLL || 1000);
    const markets = await loadMarketViews(env, date);
    const recommendations = buildPortfolioRecommendations(markets, bankroll).slice(0, 5);
    const slips = buildAutoBetSlips(recommendations, markets);
    const totalExposure = round(slips.reduce((total, slip) => total + Number(slip.stake || 0), 0), 2);
    const persisted = await persistAutoBetRun(env, date, bankroll, slips.length, totalExposure);
    const source = markets.length > 0 ? "db" : "db_empty";

    return jsonWithSourceMeta(
      request,
      {
        date,
        bankroll,
        total_slips: slips.length,
        total_exposure: totalExposure,
        slips,
        route_breakdown: {
          source_tables: ["mlb_market_views", "mlb_autobet_runs"],
          market_rows: markets.length,
          recommendations_considered: recommendations.length,
          persisted_run: persisted
        }
      },
      {
        route: "/autobet/mlb",
        source,
        tables: ["mlb_market_views", "mlb_autobet_runs"],
        notes:
          source === "db"
            ? "Autobet slips were generated from D1 market rows and persisted to mlb_autobet_runs."
            : "No D1 market rows were available for the requested date, so the route returned an empty D1-backed slip set.",
        breakdown: {
          market_rows: markets.length,
          total_slips: slips.length,
          persisted_run: persisted
        }
      },
      200,
      env
    );
  } catch (error) {
    return withError(error, env);
  }
}
