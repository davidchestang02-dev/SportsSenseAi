import { queryAll } from "../../shared/db";
import { getMockGameContexts, getMockSlate } from "../../shared/mockData";
import { jsonWithSourceMeta } from "../../shared/sourceMeta";
import type { Env, ProjectionRow } from "../../shared/types";
import { methodNotAllowed, parseDate, round, withError } from "../../shared/utils";

type TeamSummary = {
  team: string;
  team_id: number;
  game_id: string;
  expected_hits: number;
  expected_total_bases: number;
  expected_runs: number;
  average_confidence: number;
};

type ContextSummary = {
  date: string;
  game_id: string;
  away_team: string;
  away_team_id: number;
  home_team: string;
  home_team_id: number;
  weather_desc: string;
  temp: number;
  wind: number;
  park_name: string;
  park_factor: number;
  umpire_name: string;
  run_environment: number;
  bullpen_edge: number;
  confidence: number;
};

export async function handleSimRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(env);
  }

  try {
    const url = new URL(request.url);
    const date = parseDate(url.searchParams.get("date"));
    const rows =
      (await queryAll<ProjectionRow>(
        env,
        "SELECT * FROM mlb_projections WHERE date = ? ORDER BY compositeScore DESC",
        [date]
      )) || [];
    const contexts =
      (await queryAll<ContextSummary>(
        env,
        "SELECT date, game_id, away_team, away_team_id, home_team, home_team_id, weather_desc, temp, wind, park_name, park_factor, umpire_name, run_environment, bullpen_edge, confidence FROM mlb_game_context WHERE date = ? ORDER BY confidence DESC",
        [date]
      )) || [];
    const playerSource = rows.length > 0 ? "db" : "mock";
    const contextSource = contexts.length > 0 ? "db" : "mock";
    const playerRows = rows.length > 0 ? rows : getMockSlate(date);
    const contextRows = contexts.length > 0 ? contexts : getMockGameContexts(date);

    const batters = playerRows.filter((row) => row.type === "batter");
    const grouped = new Map<string, TeamSummary>();

    for (const row of batters) {
      const key = `${row.game_id}:${row.team_id}`;
      const current =
        grouped.get(key) || {
          team: row.team,
          team_id: row.team_id,
          game_id: row.game_id,
          expected_hits: 0,
          expected_total_bases: 0,
          expected_runs: 0,
          average_confidence: 0
        };

      current.expected_hits += row.P_hits_1p;
      current.expected_total_bases += row.P_tb_2p * 1.7;
      current.expected_runs += row.P_runs_1p + row.P_rbis_1p * 0.45;
      current.average_confidence += row.compositeScore;
      grouped.set(key, current);
    }

    const teams = Array.from(grouped.values()).map((team) => ({
      ...team,
      expected_hits: round(team.expected_hits, 2),
      expected_total_bases: round(team.expected_total_bases, 2),
      expected_runs: round(team.expected_runs, 2),
      average_confidence: round(team.average_confidence / 3, 1)
    }));

    const games = contextRows.map((context) => {
      const gameTeams = teams.filter((team) => team.game_id === context.game_id);
      return {
        game_id: context.game_id,
        matchup: `${context.away_team} @ ${context.home_team}`,
        projected_total: round(gameTeams.reduce((total, team) => total + team.expected_runs, 0), 2),
        run_environment: context.run_environment,
        confidence: context.confidence
      };
    });

    return jsonWithSourceMeta(
      request,
      {
        date,
        players: playerRows,
        teams,
        games,
        slate: {
          average_confidence: round(playerRows.reduce((total, row) => total + row.compositeScore, 0) / playerRows.length, 2),
          top_batters: batters.slice(0, 5),
          top_pitchers: playerRows.filter((row) => row.type === "pitcher").slice(0, 4)
        }
      },
      {
        route: "/sim/mlb",
        source: playerSource === "db" && contextSource === "db" ? "db" : playerSource === "db" || contextSource === "db" ? "db_partial" : "mock",
        tables: ["mlb_projections", "mlb_game_context"],
        notes:
          playerSource === "db" && contextSource === "db"
            ? "Projection and game-context summaries both resolved from D1."
            : playerSource === "db" || contextSource === "db"
              ? `Mixed source response: projections from ${playerSource}, game context from ${contextSource}.`
              : "Projection and game-context summaries both used seeded mock data."
      },
      200,
      env
    );
  } catch (error) {
    return withError(error, env);
  }
}
