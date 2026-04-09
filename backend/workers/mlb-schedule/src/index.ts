import { queryAll } from "../../shared/db";
import { getMockSlate } from "../../shared/mockData";
import type { Env, ProjectionRow } from "../../shared/types";
import { json, methodNotAllowed, parseDate, withError } from "../../shared/utils";

export async function handleScheduleRequest(request: Request, env: Env): Promise<Response> {
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

    return json(rows.length > 0 ? rows : getMockSlate(date), 200, env);
  } catch (error) {
    return withError(error, env);
  }
}
