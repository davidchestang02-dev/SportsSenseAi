import { queryAll, queryFirst } from "../../shared/db";
import { getMockCalibration, getMockGameContexts, getMockLive, getMockSlate } from "../../shared/mockData";
import type { CalibrationRow, Env, GameContextRow, LiveSnapshot, ProjectionRow } from "../../shared/types";
import { json, methodNotAllowed, parseDate, withError } from "../../shared/utils";

export async function handleGameContextRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(env);
  }

  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const date = parseDate(url.searchParams.get("date"));

    if (path.startsWith("/game/mlb/")) {
      const gameId = path.split("/").pop() || "";
      const rows =
        (await queryAll<ProjectionRow>(
          env,
          "SELECT * FROM mlb_projections WHERE game_id = ? ORDER BY type, compositeScore DESC",
          [gameId]
        )) || [];
      return json(rows.length > 0 ? rows : getMockSlate(date).filter((row) => row.game_id === gameId), 200, env);
    }

    if (path.startsWith("/player/mlb/")) {
      const playerId = Number(path.split("/").pop());
      const row =
        (await queryFirst<ProjectionRow>(
          env,
          "SELECT * FROM mlb_projections WHERE player_id = ? ORDER BY date DESC LIMIT 1",
          [playerId]
        )) || null;
      return json(row || getMockSlate(date).find((item) => item.player_id === playerId) || null, 200, env);
    }

    if (path.startsWith("/live/mlb")) {
      const gameId = url.searchParams.get("game_id") || "401700001";
      const live =
        (await queryFirst<LiveSnapshot>(
          env,
          "SELECT game_id, inning, inning_half, home_score, away_score, 0.5 as win_probability_home, created_at as last_update, outs, balls, strikes FROM mlb_live WHERE game_id = ? ORDER BY created_at DESC LIMIT 1",
          [gameId]
        )) || null;
      return json(live || getMockLive(gameId), 200, env);
    }

    if (path.startsWith("/admin/mlb/health-data")) {
      const rows =
        (await queryAll<CalibrationRow>(
          env,
          "SELECT date, prop_type, bucket, proj_avg, actual_avg, count FROM mlb_calibration ORDER BY date DESC, prop_type, bucket LIMIT 100"
        )) || [];
      return json(rows.length > 0 ? rows : getMockCalibration(date), 200, env);
    }

    const rows =
      (await queryAll<GameContextRow>(
        env,
        "SELECT date, game_id, away_team, away_team_id, home_team, home_team_id, weather_desc, temp, wind, park_name, park_factor, umpire_name, run_environment, bullpen_edge, confidence FROM mlb_game_context WHERE date = ? ORDER BY confidence DESC",
        [date]
      )) || [];

    return json(rows.length > 0 ? rows : getMockGameContexts(date), 200, env);
  } catch (error) {
    return withError(error, env);
  }
}
