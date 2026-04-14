import { queryAll } from "../../shared/db";
import { syncRotowireSlateSupport } from "../../shared/rotowireLineups";
import { jsonWithSourceMeta } from "../../shared/sourceMeta";
import type { Env, InjuryRow, LineupRow } from "../../shared/types";
import { syncPregameSlate } from "../../mlb-pregame/src/index";
import { methodNotAllowed, parseDate, withError } from "../../shared/utils";

export async function handleLineupsRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(env);
  }

  try {
    const url = new URL(request.url);
    const date = parseDate(url.searchParams.get("date"));
    const lineups =
      (await queryAll<LineupRow>(
        env,
        "SELECT date, game_id, team_id, team, player_id, player_name, batting_order, confirmed, CASE WHEN confirmed = 1 THEN 'Confirmed' ELSE 'Expected' END as status FROM mlb_lineups WHERE date = ? ORDER BY game_id, team_id, batting_order",
        [date]
      )) || [];
    const injuries =
      (await queryAll<InjuryRow>(
        env,
        "SELECT player_id, player_name, team_id, team, status, description, last_updated FROM mlb_injuries ORDER BY last_updated DESC LIMIT 25"
      )) || [];

    if (lineups.length > 0 || injuries.length > 0) {
      const source = lineups.length > 0 && injuries.length > 0 ? "db" : "db_partial";
      return jsonWithSourceMeta(
        request,
        { date, lineups, injuries },
        {
          route: "/lineups/mlb",
          source,
          tables: ["mlb_lineups", "mlb_injuries"],
          notes: source === "db" ? "Lineups and injuries both resolved from D1." : "Only part of the lineup package resolved from D1."
        },
        200,
        env
      );
    }

    const pregameGames = await syncPregameSlate(env, date);
    const support = await syncRotowireSlateSupport(env, date, pregameGames);

    return jsonWithSourceMeta(
      request,
      {
        date,
        lineups: support.lineups,
        injuries: support.injuries
      },
      {
        route: "/lineups/mlb",
        source: support.lineups.length > 0 || support.injuries.length > 0 ? "external_plus_db" : "empty",
        tables: ["mlb_lineups", "mlb_injuries"],
        notes:
          support.lineups.length > 0 || support.injuries.length > 0
            ? "Lineups were refreshed from RotoWire daily lineups and paired with ESPN team injuries before returning."
            : "No live lineup or injury rows were available from D1 or the upstream fallback sources for the selected date.",
        breakdown: {
          lineups: support.lineups.length,
          injuries: support.injuries.length,
          matched_games: support.matchedGames
        }
      },
      200,
      env
    );
  } catch (error) {
    return withError(error, env);
  }
}
