import { queryAll } from "../../shared/db";
import { getMockMarkets } from "../../shared/mockData";
import { jsonWithSourceMeta } from "../../shared/sourceMeta";
import type { Env, MarketRow } from "../../shared/types";
import { methodNotAllowed, parseDate, withError } from "../../shared/utils";

export async function handleMarketMakerRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(env);
  }

  try {
    const url = new URL(request.url);
    const date = parseDate(url.searchParams.get("date"));
    const markets =
      (await queryAll<MarketRow>(
        env,
        "SELECT date, game_id, player_id, player_name, team, prop_type, fair_probability, fair_american, posted_american, best_book, edge, confidence FROM mlb_market_views WHERE date = ? ORDER BY edge DESC, confidence DESC",
        [date]
      )) || [];

    const source = markets.length > 0 ? "db" : "mock";
    const payload = markets.length > 0 ? markets : getMockMarkets(date);

    return jsonWithSourceMeta(
      request,
      payload,
      {
        route: "/market/mlb",
        source,
        tables: ["mlb_market_views"],
        notes: source === "db" ? "Market views resolved from D1." : "No market rows found in D1, so seeded markets were returned."
      },
      200,
      env
    );
  } catch (error) {
    return withError(error, env);
  }
}
