import { execute, queryAll } from "../../shared/db";
import { buildPortfolioRecommendations, buildPortfolioRecommendationsFromBets } from "../../shared/portfolioEngine";
import { jsonWithSourceMeta } from "../../shared/sourceMeta";
import type { Env, MarketRow, PortfolioBet } from "../../shared/types";
import { methodNotAllowed, parseDate, round, withError } from "../../shared/utils";

const MARKET_QUERY =
  "SELECT date, game_id, player_id, player_name, team, prop_type, fair_probability, fair_american, posted_american, best_book, edge, confidence FROM mlb_market_views WHERE date = ? ORDER BY edge DESC, confidence DESC, fair_probability DESC";

async function loadMarketViews(env: Env, date: string): Promise<MarketRow[]> {
  return (await queryAll<MarketRow>(env, MARKET_QUERY, [date])) || [];
}

async function persistRiskRun(env: Env, date: string, bankroll: number, totalStake: number, averageEdge: number): Promise<boolean> {
  return execute(env, "INSERT INTO mlb_risk_runs (date, bankroll, total_stake, avg_edge) VALUES (?, ?, ?, ?)", [
    date,
    bankroll,
    round(totalStake, 2),
    round(averageEdge, 4)
  ]);
}

export async function handleRiskEngineRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return methodNotAllowed(env);
  }

  try {
    const url = new URL(request.url);
    const body =
      request.method === "POST" ? ((await request.json()) as { bankroll?: number; bets?: PortfolioBet[]; date?: string }) : null;
    const bankroll = Number(body?.bankroll || env.SSA_DEFAULT_BANKROLL || 1000);
    const date = parseDate(body?.date || url.searchParams.get("date"));
    const bets = body?.bets || [];

    if (bets.length > 0) {
      const recommendations = buildPortfolioRecommendationsFromBets(bets, bankroll);
      const totalStake = recommendations.reduce((total, bet) => total + Number(bet.capped_stake || 0), 0);
      const averageEdge =
        recommendations.length > 0
          ? recommendations.reduce((total, bet) => total + Number(bet.edge || 0), 0) / recommendations.length
          : 0;
      const persisted = await persistRiskRun(env, date, bankroll, totalStake, averageEdge);

      return jsonWithSourceMeta(
        request,
        {
          date,
          bankroll,
          recommendation_count: recommendations.length,
          recommendations,
          route_breakdown: {
            source_tables: ["request_payload", "mlb_risk_runs"],
            request_bets: bets.length,
            persisted_run: persisted
          }
        },
        {
          route: "/risk/mlb",
          source: "computed_request",
          tables: ["mlb_risk_runs"],
          notes: "Risk output was computed from the caller-supplied bet payload and persisted for auditing.",
          breakdown: {
            request_bets: bets.length,
            persisted_run: persisted
          }
        },
        200,
        env
      );
    }

    const markets = await loadMarketViews(env, date);
    const recommendations = buildPortfolioRecommendations(markets, bankroll);
    const totalStake = recommendations.reduce((total, bet) => total + Number(bet.capped_stake || 0), 0);
    const averageEdge =
      recommendations.length > 0
        ? recommendations.reduce((total, bet) => total + Number(bet.edge || 0), 0) / recommendations.length
        : 0;
    const persisted = await persistRiskRun(env, date, bankroll, totalStake, averageEdge);
    const source = markets.length > 0 ? "db" : "db_empty";

    return jsonWithSourceMeta(
      request,
      {
        date,
        bankroll,
        recommendation_count: recommendations.length,
        recommendations,
        route_breakdown: {
          source_tables: ["mlb_market_views", "mlb_risk_runs"],
          market_rows: markets.length,
          persisted_run: persisted,
          avg_edge: round(averageEdge, 4),
          total_stake: round(totalStake, 2)
        }
      },
      {
        route: "/risk/mlb",
        source,
        tables: ["mlb_market_views", "mlb_risk_runs"],
        notes:
          source === "db"
            ? "Risk recommendations were generated from D1 market rows and persisted to mlb_risk_runs."
            : "No D1 market rows were available for the requested date, so the route returned an empty D1-backed result.",
        breakdown: {
          market_rows: markets.length,
          recommendation_count: recommendations.length,
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
