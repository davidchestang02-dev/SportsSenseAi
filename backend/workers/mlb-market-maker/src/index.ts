import { queryAll } from "../../shared/db";
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

    return jsonWithSourceMeta(
      request,
      markets,
      {
        route: "/market/mlb",
        source: markets.length > 0 ? "db" : "empty",
        tables: ["mlb_market_views"],
        notes: markets.length > 0 ? "Market views resolved from D1." : "No market rows were available in D1 for the selected date."
      },
      200,
      env
    );
  } catch (error) {
    return withError(error, env);
  }
}
