import type { AutoBetSlip, MarketRow, PortfolioBet, PortfolioRecommendation } from "./types";
import { americanFromProbability, clamp, decimalFromAmerican, probabilityFromAmerican, round } from "./utils";

type CandidateBet = {
  game_id: string;
  player_id: number;
  player_name: string;
  prop_type: string;
  fair_probability: number;
  posted_american: number;
  confidence: number;
  best_book?: string;
  team?: string;
  correlation_group: string;
};

function recommendationScore(item: PortfolioRecommendation): number {
  return Number(item.edge || 0) * Number(item.confidence || 0);
}

function buildRecommendationFromCandidate(bet: CandidateBet, bankroll: number): PortfolioRecommendation {
  const decimalOdds = decimalFromAmerican(bet.posted_american);
  const impliedProbability = probabilityFromAmerican(bet.posted_american);
  const edge = round(bet.fair_probability - impliedProbability, 4);
  const b = decimalOdds - 1;
  const rawKelly = b <= 0 ? 0 : (bet.fair_probability * b - (1 - bet.fair_probability)) / b;
  const confidenceFactor = clamp(bet.confidence / 100, 0.35, 1);
  const kellyFraction = round(clamp(rawKelly, 0, 0.1) * confidenceFactor, 4);
  const recommendedStake = round(bankroll * kellyFraction, 2);
  const cappedStake = round(Math.min(recommendedStake, bankroll * 0.025), 2);

  return {
    player_id: bet.player_id,
    player_name: bet.player_name,
    prop_type: bet.prop_type,
    fair_probability: bet.fair_probability,
    posted_american: bet.posted_american,
    confidence: bet.confidence,
    correlation_group: bet.correlation_group,
    edge,
    decimal_odds: decimalOdds,
    kelly_fraction: kellyFraction,
    recommended_stake: recommendedStake,
    capped_stake: cappedStake
  } satisfies PortfolioRecommendation;
}

export function toCandidateBets(markets: MarketRow[]): CandidateBet[] {
  return markets
    .filter((market) => Number(market.fair_probability || 0) > 0 && Number(market.posted_american || 0) !== 0)
    .map((market) => ({
      game_id: market.game_id,
      player_id: market.player_id,
      player_name: market.player_name,
      prop_type: market.prop_type,
      fair_probability: Number(market.fair_probability || 0),
      posted_american: Number(market.posted_american || 0),
      confidence: Number(market.confidence || 0),
      best_book: market.best_book,
      team: market.team,
      correlation_group: `${market.game_id}:${market.team}`
    }));
}

export function toCandidateBetsFromPortfolio(bets: PortfolioBet[]): CandidateBet[] {
  return bets
    .filter((bet) => Number(bet.fair_probability || 0) > 0 && Number(bet.posted_american || 0) !== 0)
    .map((bet) => ({
      game_id: "",
      player_id: bet.player_id,
      player_name: bet.player_name,
      prop_type: bet.prop_type,
      fair_probability: Number(bet.fair_probability || 0),
      posted_american: Number(bet.posted_american || 0),
      confidence: Number(bet.confidence || 0),
      correlation_group: bet.correlation_group || `${bet.player_id}:${bet.prop_type}`
    }));
}

export function buildPortfolioRecommendations(markets: MarketRow[], bankroll: number): PortfolioRecommendation[] {
  const candidates = toCandidateBets(markets)
    .map((bet) => buildRecommendationFromCandidate(bet, bankroll))
    .filter((bet) => Number(bet.edge || 0) > 0 && Number(bet.capped_stake || 0) > 0)
    .sort((left, right) => recommendationScore(right) - recommendationScore(left));

  const output: PortfolioRecommendation[] = [];
  const perGroupCount = new Map<string, number>();

  for (const bet of candidates) {
    const group = bet.correlation_group || "ungrouped";
    const seen = perGroupCount.get(group) || 0;
    if (seen >= 2) {
      continue;
    }

    output.push(bet);
    perGroupCount.set(group, seen + 1);

    if (output.length >= 8) {
      break;
    }
  }

  return output;
}

export function buildPortfolioRecommendationsFromBets(bets: PortfolioBet[], bankroll: number): PortfolioRecommendation[] {
  return toCandidateBetsFromPortfolio(bets)
    .map((bet) => buildRecommendationFromCandidate(bet, bankroll))
    .filter((bet) => Number(bet.edge || 0) > 0 && Number(bet.capped_stake || 0) > 0)
    .sort((left, right) => recommendationScore(right) - recommendationScore(left));
}

export function buildAutoBetSlips(recommendations: PortfolioRecommendation[], markets: MarketRow[]): AutoBetSlip[] {
  const marketMap = new Map<string, MarketRow>(
    markets.map((market) => [`${market.player_id}:${market.prop_type}`, market])
  );

  return recommendations.map((bet) => {
    const market = marketMap.get(`${bet.player_id}:${bet.prop_type}`);
    return {
      book: market?.best_book || "Best Available",
      player_name: bet.player_name,
      prop_type: bet.prop_type,
      odds: bet.posted_american,
      stake: bet.capped_stake,
      edge: bet.edge,
      confidence: bet.confidence
    };
  });
}

export function deriveMarketRowsFromProjections(date: string, rows: Array<Record<string, unknown>>): MarketRow[] {
  return rows
    .filter((row) => row.type === "batter")
    .flatMap((row) => {
      const propMap = [
        { prop_type: "Hits 1+", probability: Number(row.P_hits_1p || 0) },
        { prop_type: "TB 2+", probability: Number(row.P_tb_2p || 0) },
        { prop_type: "H+R+RBI 2+", probability: Number(row.P_hrh_2p || 0) }
      ];

      return propMap.map((prop) => {
        const fair = americanFromProbability(prop.probability);
        return {
          date,
          game_id: String(row.game_id || ""),
          player_id: Number(row.player_id || 0),
          player_name: String(row.player_name || ""),
          team: String(row.team || ""),
          prop_type: prop.prop_type,
          fair_probability: prop.probability,
          fair_american: fair,
          posted_american: fair,
          best_book: "Model Fair",
          edge: 0,
          confidence: Number(row.compositeScore || 0)
        } satisfies MarketRow;
      });
    });
}
