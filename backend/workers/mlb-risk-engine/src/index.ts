import { getMockPortfolio, recommendPortfolio } from "../../shared/mockData";
import type { Env, PortfolioBet } from "../../shared/types";
import { json, methodNotAllowed, parseDate, withError } from "../../shared/utils";

export async function handleRiskEngineRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    const date = parseDate(new URL(request.url).searchParams.get("date"));
    return json({ date, recommendations: getMockPortfolio(date, Number(env.SSA_DEFAULT_BANKROLL || 1000)) }, 200, env);
  }

  if (request.method !== "POST") {
    return methodNotAllowed(env);
  }

  try {
    const payload = (await request.json()) as { bankroll?: number; bets?: PortfolioBet[]; date?: string };
    const bankroll = payload.bankroll || Number(env.SSA_DEFAULT_BANKROLL || 1000);
    const date = parseDate(payload.date);
    const bets = payload.bets;

    if (!bets || bets.length === 0) {
      return json({ date, recommendations: getMockPortfolio(date, bankroll) }, 200, env);
    }

    return json({ date, recommendations: recommendPortfolio(bets, bankroll) }, 200, env);
  } catch (error) {
    return withError(error, env);
  }
}
