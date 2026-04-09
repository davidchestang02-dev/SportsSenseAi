import { getMockAutoBet } from "../../shared/mockData";
import type { Env } from "../../shared/types";
import { json, methodNotAllowed, parseDate, withError } from "../../shared/utils";

export async function handleAutoBetRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return methodNotAllowed(env);
  }

  try {
    const date = parseDate(new URL(request.url).searchParams.get("date"));
    const bankroll =
      request.method === "POST"
        ? Number(((await request.json()) as { bankroll?: number }).bankroll || env.SSA_DEFAULT_BANKROLL || 1000)
        : Number(env.SSA_DEFAULT_BANKROLL || 1000);
    const result = getMockAutoBet(date, bankroll);

    return json(
      {
        date,
        bankroll,
        total_slips: result.slips.length,
        total_exposure: result.exposure,
        slips: result.slips
      },
      200,
      env
    );
  } catch (error) {
    return withError(error, env);
  }
}
