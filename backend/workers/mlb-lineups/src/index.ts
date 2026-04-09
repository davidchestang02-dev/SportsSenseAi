import { queryAll } from "../../shared/db";
import { getMockLineups } from "../../shared/mockData";
import type { Env, InjuryRow, LineupRow } from "../../shared/types";
import { json, methodNotAllowed, parseDate, withError } from "../../shared/utils";

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
        "SELECT date, game_id, team_id, team, player_id, player_name, batting_order, confirmed, 'Confirmed' as status FROM mlb_lineups WHERE date = ? ORDER BY game_id, team_id, batting_order",
        [date]
      )) || [];
    const injuries =
      (await queryAll<InjuryRow>(
        env,
        "SELECT player_id, player_name, team_id, team, status, description, last_updated FROM mlb_injuries ORDER BY last_updated DESC LIMIT 25"
      )) || [];

    if (lineups.length > 0 || injuries.length > 0) {
      return json({ date, lineups, injuries }, 200, env);
    }

    return json({ date, ...getMockLineups(date) }, 200, env);
  } catch (error) {
    return withError(error, env);
  }
}
