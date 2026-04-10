import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis
} from "recharts";

import { askAi, getGameOddsHistory, getGameOddsMovement } from "./api";
import { getTeamLabel } from "./media";
import { usePlayerResearch, useResearchSlate, useTeamResearch } from "./researchData";
import {
  EmptyState,
  fmtDecimal,
  fmtMoneyline,
  fmtPercent,
  fmtRate,
  fmtSignedPercent,
  MetricCard,
  PagePanel,
  PlayerPortrait,
  TeamMark
} from "./ui";

const chartColors = ["#2DA8FF", "#5BD3FF", "#FF8A00", "#FFB650", "#18C37E"];

function firstOrNull(rows) {
  return rows && rows.length > 0 ? rows[0] : null;
}

function buildGameOutlook(simulation, contexts) {
  return (simulation.games || []).map((game) => {
    const context = (contexts || []).find((item) => item.game_id === game.game_id);
    return {
      ...game,
      run_environment: Number(context?.run_environment || game.run_environment || 0),
      confidence: Number(context?.confidence || game.confidence || 0)
    };
  });
}

function buildEdgeDistribution(markets) {
  return (markets || []).slice(0, 8).map((market) => ({
    label: `${market.player_name.split(" ").slice(-1)[0]} ${market.prop_type}`,
    edge: Number(market.edge || 0) * 100,
    confidence: Number(market.confidence || 0)
  }));
}

function buildCalibrationSeries(calibration) {
  return (calibration || [])
    .filter((row) => row.prop_type === "hrh_2p")
    .map((row) => ({
      bucket: `${Math.round(Number(row.bucket || 0) * 100)}%`,
      projected: Number(row.proj_avg || 0) * 100,
      actual: Number(row.actual_avg || 0) * 100
    }));
}

function buildRunEnvironmentScatter(simulation, contexts) {
  return buildGameOutlook(simulation, contexts).map((game) => ({
    matchup: game.matchup,
    projected_total: Number(game.projected_total || 0),
    run_environment: Number(game.run_environment || 0),
    confidence: Number(game.confidence || 0)
  }));
}

function buildMatchupBoardRows(games, contexts) {
  return (games || []).map((game) => {
    const context = (contexts || []).find(
      (item) =>
        Number(item.away_team_id || 0) === Number(game.awayTeam?.id || 0) &&
        Number(item.home_team_id || 0) === Number(game.homeTeam?.id || 0)
    );

    return {
      gamePk: game.gamePk,
      matchup: game.matchupLabel,
      awayTeam: game.awayTeam?.shortDisplayName || game.awayTeam?.name,
      homeTeam: game.homeTeam?.shortDisplayName || game.homeTeam?.name,
      venue: game.venue?.name || "Venue TBD",
      firstPitch: formatGameTime(game.gameDate),
      starterAway: game.probablePitchers?.away?.fullName || "TBD",
      starterHome: game.probablePitchers?.home?.fullName || "TBD",
      run_environment: Number(context?.run_environment || 0),
      confidence: Number(context?.confidence || 0)
    };
  });
}

function buildMarketRows(markets) {
  return (markets || []).slice(0, 18).map((market) => {
    const edge = Number(market.edge || 0);
    const confidence = Number(market.confidence || 0);
    let status = "Watch";
    if (edge >= 0.05 && confidence >= 75) {
      status = "Prime";
    } else if (edge >= 0.025) {
      status = "Playable";
    }

    return {
      ...market,
      status
    };
  });
}

function buildMarketSummary(markets, recommendations, slips) {
  const topEdge = firstOrNull(markets || []);
  const averageEdge =
    (markets || []).length > 0
      ? (markets || []).reduce((total, market) => total + Number(market.edge || 0), 0) / (markets || []).length
      : 0;
  const totalStake = (recommendations || []).reduce((total, bet) => total + Number(bet.capped_stake || 0), 0);
  const totalExposure = (slips || []).reduce((total, slip) => total + Number(slip.stake || 0), 0);

  return {
    topEdge,
    averageEdge,
    totalStake,
    totalExposure
  };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = numberOrNull(value);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function fmtOptionalMoneyline(value) {
  const number = numberOrNull(value);
  return number === null ? "--" : fmtMoneyline(number);
}

function fmtLine(value, signed = false) {
  const number = numberOrNull(value);
  if (number === null) {
    return "--";
  }

  const formatted = Number.isInteger(number) ? String(number) : number.toFixed(1);
  return signed && number > 0 ? `+${formatted}` : formatted;
}

function scheduleMatchupLabel(game) {
  if (!game) {
    return "Matchup pending";
  }

  return `${game.teams?.away?.abbreviation || game.teams?.away?.name || "Away"} @ ${game.teams?.home?.abbreviation || game.teams?.home?.name || "Home"}`;
}

function currentMoneyline(side) {
  return firstNumber(side?.current, side?.close, side?.open);
}

function currentPointLine(point) {
  return firstNumber(point?.current?.line, point?.close?.line, point?.open?.line);
}

function currentPointOdds(point) {
  return firstNumber(point?.current?.odds, point?.close?.odds, point?.open?.odds);
}

function formatPointValue(point, signed = true) {
  const line = currentPointLine(point);
  const odds = currentPointOdds(point);

  if (line === null && odds === null) {
    return "--";
  }

  if (line !== null && odds !== null) {
    return `${fmtLine(line, signed)} (${fmtOptionalMoneyline(odds)})`;
  }

  if (line !== null) {
    return fmtLine(line, signed);
  }

  return fmtOptionalMoneyline(odds);
}

function formatMoneylineMove(side) {
  const open = numberOrNull(side?.open);
  const latest = currentMoneyline(side);

  if (open === null || latest === null) {
    return "--";
  }

  return `${fmtOptionalMoneyline(open)} -> ${fmtOptionalMoneyline(latest)}`;
}

function formatPointMove(point, signed = true) {
  const open = numberOrNull(point?.open?.line);
  const latest = currentPointLine(point);

  if (open === null || latest === null) {
    return "--";
  }

  return `${fmtLine(open, signed)} -> ${fmtLine(latest, signed)}`;
}

function buildScheduleOddsRows(games) {
  return (games || [])
    .filter((game) => game?.odds?.provider)
    .map((game) => {
      const totalLine = firstNumber(game?.odds?.total?.over?.current?.line, game?.odds?.total?.over?.close?.line, game?.odds?.total?.over?.open?.line);
      const favoriteMoneyline = game?.odds?.favorite === game?.teams?.home?.abbreviation
        ? currentMoneyline(game?.odds?.moneyline?.home)
        : game?.odds?.favorite === game?.teams?.away?.abbreviation
          ? currentMoneyline(game?.odds?.moneyline?.away)
          : null;

      return {
        gameId: game.gameId,
        matchup: scheduleMatchupLabel(game),
        status: game.status,
        summary: game.summary || "Awaiting update",
        provider: game.odds.provider.name,
        moneyline: `${game.teams?.away?.abbreviation || "Away"} ${fmtOptionalMoneyline(currentMoneyline(game.odds.moneyline.away))} / ${game.teams?.home?.abbreviation || "Home"} ${fmtOptionalMoneyline(currentMoneyline(game.odds.moneyline.home))}`,
        total: `O ${fmtLine(totalLine)} ${fmtOptionalMoneyline(currentPointOdds(game.odds.total.over))} / U ${fmtLine(totalLine)} ${fmtOptionalMoneyline(currentPointOdds(game.odds.total.under))}`,
        runline: `${game.odds.favorite || game.teams?.home?.abbreviation || "Home"} ${formatPointValue(
          game.odds.favorite === game.teams?.away?.abbreviation ? game.odds.spread.away : game.odds.spread.home,
          true
        )}`,
        favorite: game.odds.favorite,
        favoriteMoneyline,
        totalLine
      };
    });
}

function buildScheduleSummary(games) {
  const oddsRows = buildScheduleOddsRows(games);
  const inPlay = (games || []).filter((game) => game.status === "IN_PROGRESS").length;
  const largestFavorite = oddsRows
    .filter((row) => row.favorite && row.favoriteMoneyline !== null)
    .sort((left, right) => Math.abs(right.favoriteMoneyline) - Math.abs(left.favoriteMoneyline))[0] || null;
  const highestTotal = oddsRows
    .filter((row) => row.totalLine !== null)
    .sort((left, right) => Number(right.totalLine || 0) - Number(left.totalLine || 0))[0] || null;

  return {
    pricedGames: oddsRows.length,
    inPlay,
    largestFavorite,
    highestTotal
  };
}

function buildLineMovementRows(games) {
  return (games || [])
    .filter((game) => game?.odds?.provider)
    .map((game) => {
      const homeMoneylineOpen = numberOrNull(game?.odds?.moneyline?.home?.open);
      const homeMoneylineLatest = currentMoneyline(game?.odds?.moneyline?.home);
      const totalOpen = numberOrNull(game?.odds?.total?.over?.open?.line);
      const totalLatest = currentPointLine(game?.odds?.total?.over);
      const runlineOpen = numberOrNull(game?.odds?.spread?.home?.open?.line);
      const runlineLatest = currentPointLine(game?.odds?.spread?.home);

      return {
        gameId: game.gameId,
        matchup: scheduleMatchupLabel(game),
        status: game.status,
        moneyline: `${game.teams?.home?.abbreviation || "Home"} ${formatMoneylineMove(game?.odds?.moneyline?.home)}`,
        total: formatPointMove(game?.odds?.total?.over, false),
        runline: `${game.teams?.home?.abbreviation || "Home"} ${formatPointMove(game?.odds?.spread?.home, true)}`,
        movementMagnitude: Math.max(
          Math.abs((homeMoneylineLatest ?? homeMoneylineOpen ?? 0) - (homeMoneylineOpen ?? homeMoneylineLatest ?? 0)),
          Math.abs((totalLatest ?? totalOpen ?? 0) - (totalOpen ?? totalLatest ?? 0)),
          Math.abs((runlineLatest ?? runlineOpen ?? 0) - (runlineOpen ?? runlineLatest ?? 0))
        )
      };
    })
    .sort((left, right) => right.movementMagnitude - left.movementMagnitude);
}

function buildRecentGameRows(playerResearch) {
  return (playerResearch?.recent?.games || []).slice(0, 10).map((game, index) => ({
    key: `${game.date || "game"}-${index}`,
    date: game.date || "--",
    opponent: game.opponent || game.summaryOpponent || "Opponent",
    venue: game.isHome ? "Home" : "Away",
    summary: game.summary || "Stat line unavailable"
  }));
}

function buildPitchTimeline(live) {
  return (live?.recent_events || []).slice().reverse().map((event, index) => ({
    label: `${event.inning_half || ""} ${event.inning || ""}-${index + 1}`,
    speed: Number(event.pitch_speed || 0),
    home: Number(event.home_score || 0),
    away: Number(event.away_score || 0)
  }));
}

function formatOddsTimestamp(value) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function buildOddsHistorySeries(history) {
  return (history?.points || []).map((point, index) => ({
    label: formatOddsTimestamp(point.timestamp),
    order: index + 1,
    homeMoneyline: numberOrNull(point?.moneyline?.home),
    awayMoneyline: numberOrNull(point?.moneyline?.away),
    totalLine: numberOrNull(point?.total?.line),
    homeSpreadLine: numberOrNull(point?.spread?.home?.line),
    awaySpreadLine: numberOrNull(point?.spread?.away?.line)
  }));
}

function useGameOddsInsights(gameId, date) {
  const [state, setState] = useState({
    loading: false,
    error: "",
    history: null,
    movement: null
  });

  useEffect(() => {
    let active = true;

    if (!gameId) {
      setState({
        loading: false,
        error: "",
        history: null,
        movement: null
      });
      return () => {
        active = false;
      };
    }

    async function load() {
      setState((current) => ({
        ...current,
        loading: true,
        error: ""
      }));

      const results = await Promise.allSettled([
        getGameOddsHistory(gameId, { date, limit: 24 }),
        getGameOddsMovement(gameId, { date })
      ]);

      if (!active) {
        return;
      }

      const error = results
        .map((result, index) => ({ result, index }))
        .filter(({ result }) => result.status === "rejected")
        .map(({ index }) => (index === 0 ? "history" : "movement"))
        .join(", ");

      setState({
        loading: false,
        error,
        history: results[0].status === "fulfilled" ? results[0].value?.data || null : null,
        movement: results[1].status === "fulfilled" ? results[1].value?.data || null : null
      });
    }

    load();

    return () => {
      active = false;
    };
  }, [gameId, date]);

  return state;
}

function getRouteAudit(dataHealth, path) {
  return (dataHealth?.routes || []).find((route) => route.path === path) || null;
}

function buildPlayerProfile(player) {
  if (!player) {
    return [];
  }

  return [
    { label: "Hits 1+", value: Number(player.P_hits_1p || 0) * 100 },
    { label: "Runs 1+", value: Number(player.P_runs_1p || 0) * 100 },
    { label: "RBI 1+", value: Number(player.P_rbis_1p || 0) * 100 },
    { label: "TB 2+", value: Number(player.P_tb_2p || 0) * 100 },
    { label: "HRH 2+", value: Number(player.P_hrh_2p || 0) * 100 }
  ];
}

function renderChart(element) {
  return <div className="chart-shell">{element}</div>;
}

function formatRecord(team) {
  if (!team?.record) {
    return "Record unavailable";
  }

  const wins = team.record.wins ?? "--";
  const losses = team.record.losses ?? "--";
  return `${wins}-${losses}`;
}

function formatGameTime(value) {
  if (!value) {
    return "TBD";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function handToSplitCode(hand) {
  return hand === "L" ? "vl" : "vr";
}

function buildPlayerLink({ gamePk, teamId, playerId, opponentTeamId, opposingPitcherId }) {
  const search = new URLSearchParams();
  if (gamePk) search.set("gamePk", String(gamePk));
  if (teamId) search.set("teamId", String(teamId));
  if (playerId) search.set("playerId", String(playerId));
  if (opponentTeamId) search.set("opponentTeamId", String(opponentTeamId));
  if (opposingPitcherId) search.set("opposingPitcherId", String(opposingPitcherId));
  return `/players?${search.toString()}`;
}

function playerName(player) {
  return player?.fullName || player?.player_name || "Player";
}

function isPitcherProfile(playerResearch) {
  return playerResearch?.group === "pitching";
}

function buildPlayerTrend(playerResearch) {
  const games = playerResearch?.recent?.games || [];

  if (isPitcherProfile(playerResearch)) {
    return games.slice(0, 10).reverse().map((game) => ({
      label: game.date ? game.date.slice(5) : "",
      strikeOuts: Number(game?.stat?.strikeOuts || 0),
      earnedRuns: Number(game?.stat?.earnedRuns || 0),
      hits: Number(game?.stat?.hits || 0)
    }));
  }

  return games.slice(0, 10).reverse().map((game) => ({
    label: game.date ? game.date.slice(5) : "",
    hits: Number(game?.stat?.hits || 0),
    totalBases: Number(game?.stat?.totalBases || 0),
    rbi: Number(game?.stat?.rbi || 0)
  }));
}

function buildPlayerMetricCards(playerResearch) {
  const seasonStats = playerResearch?.seasonStats?.stat || {};

  if (isPitcherProfile(playerResearch)) {
    return [
      { label: "ERA", value: seasonStats.era || "--", note: "Current season" },
      { label: "WHIP", value: seasonStats.whip || "--", note: "Traffic control" },
      { label: "K/9", value: seasonStats.strikeoutsPer9Inn || "--", note: "Miss-bat rate" },
      { label: "IP", value: seasonStats.inningsPitched || "--", note: "Workload" }
    ];
  }

  return [
    { label: "AVG", value: seasonStats.avg || "--", note: "Current season" },
    { label: "OPS", value: seasonStats.ops || "--", note: "Overall production" },
    { label: "HR", value: String(seasonStats.homeRuns || 0), note: "Power profile" },
    { label: "RBI", value: String(seasonStats.rbi || 0), note: "Run production" }
  ];
}

function playerSecondaryLine(player) {
  const stat = player?.stat || player?.hitterStats?.stat || player?.pitcherStats?.stat || {};
  const position = player?.position?.abbreviation || "UTIL";

  if (stat.era || stat.inningsPitched) {
    return `${position} • ${stat.inningsPitched || "--"} IP • ${stat.era || "--"} ERA`;
  }

  if (stat.ops || stat.avg) {
    return `${position} • AVG ${stat.avg || "--"} • OPS ${stat.ops || "--"}`;
  }

  return position;
}

function SplitInsightCard({ label, split, pitcherHandNote }) {
  if (!split) {
    return (
      <article className="split-card">
        <span className="mini-label">{label}</span>
        <strong>No split returned yet</strong>
      </article>
    );
  }

  const stat = split.stat || {};
  const metrics =
    stat.era || stat.inningsPitched
      ? [
          { label: "AVG", value: stat.avg || "--" },
          { label: "WHIP", value: stat.whip || "--" },
          { label: "K/9", value: stat.strikeoutsPer9Inn || "--" },
          { label: "HR/9", value: stat.homeRunsPer9 || "--" }
        ]
      : [
          { label: "AVG", value: stat.avg || "--" },
          { label: "OBP", value: stat.obp || "--" },
          { label: "SLG", value: stat.slg || "--" },
          { label: "OPS", value: stat.ops || "--" }
        ];

  return (
    <article className="split-card">
      <span className="mini-label">{label}</span>
      <strong>{pitcherHandNote || split.description || "Split Profile"}</strong>
      <div className="split-stat-grid">
        {metrics.map((metric) => (
          <div key={metric.label} className="info-pair">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function WindowSummaryCard({ label, summary, isPitcher }) {
  if (!summary) {
    return (
      <article className="detail-card">
        <span className="detail-label">{label}</span>
        <strong className="detail-card-value">No games</strong>
      </article>
    );
  }

  return (
    <article className="detail-card">
      <span className="detail-label">{label}</span>
      <strong className="detail-card-value">{summary.gamesPlayed} games</strong>
      <p>
        {isPitcher
          ? `${summary.inningsPitched} IP • ${summary.era ?? "--"} ERA • ${summary.strikeOuts} K`
          : `${summary.hits} H • ${summary.homeRuns} HR • OPS ${fmtRate(summary.ops)}`}
      </p>
    </article>
  );
}

function RosterResearchCard({ player, to }) {
  return (
    <Link className="roster-card" to={to}>
      <div className="player-summary">
        <PlayerPortrait player={player} />
        <div>
          <strong>{playerName(player)}</strong>
          <small>{playerSecondaryLine(player)}</small>
        </div>
      </div>
      <div className="team-pill-row">
        {player?.bats ? <span className="stat-chip">Bats {player.bats}</span> : null}
        {player?.throws ? <span className="stat-chip">Throws {player.throws}</span> : null}
        {player?.age ? <span className="stat-chip">Age {player.age}</span> : null}
      </div>
    </Link>
  );
}

function MatchupTile({ game, isActive, onSelect }) {
  return (
    <button className={`matchup-tile${isActive ? " is-active" : ""}`} type="button" onClick={onSelect}>
      <div className="matchup-tile-head">
        <TeamMark team={game.awayTeam} compact />
        <span>@</span>
        <TeamMark team={game.homeTeam} compact />
      </div>
      <strong>{game.matchupLabel}</strong>
      <small>
        {formatGameTime(game.gameDate)} • {game.venue?.name || "Venue TBD"}
      </small>
    </button>
  );
}

function ScoreboardMatchupTile({ game, isActive, onSelect }) {
  const totalLine = firstNumber(game?.odds?.total?.over?.current?.line, game?.odds?.total?.over?.close?.line, game?.odds?.total?.over?.open?.line);

  return (
    <button className={`matchup-tile${isActive ? " is-active" : ""}`} type="button" onClick={onSelect}>
      <div className="matchup-tile-head">
        <TeamMark team={game.teams?.away} compact />
        <span>@</span>
        <TeamMark team={game.teams?.home} compact />
      </div>
      <strong>{scheduleMatchupLabel(game)}</strong>
      <small>
        {formatGameTime(game.startTime)} â€¢ {game.location || "Venue TBD"}
      </small>
      <div className="team-pill-row">
        <span className={`status-flag status-flag--${String(game.status || "unknown").toLowerCase()}`}>{String(game.status || "UNKNOWN").replace(/_/g, " ")}</span>
        {game?.odds?.provider ? <span className="stat-chip">{game.odds.provider.name}</span> : null}
        {totalLine !== null ? <span className="stat-chip">Total {fmtLine(totalLine)}</span> : null}
      </div>
    </button>
  );
}

function SourceBadge({ route }) {
  if (!route) {
    return <span className="source-pill source-pill--unknown">Source pending</span>;
  }

  return (
    <span className={`source-pill source-pill--${route.verification_status}`}>
      {route.verification_status === "verified" ? "D1 verified" : route.verification_status === "partial" ? "Partially verified" : "Needs upgrade"}
    </span>
  );
}

function ResearchLoading({ message }) {
  return <div className="empty-state">{message}</div>;
}

function PlayerSignalCard({ player }) {
  if (!player) {
    return <EmptyState>No player signal is available yet.</EmptyState>;
  }

  return (
    <article className="player-card">
      <div className="player-card-head">
        <div className="player-summary">
          <PlayerPortrait player={player} />
          <div className="player-card-copy">
            <strong>{player.player_name}</strong>
            <small>
              {player.team} vs {player.opp_team}
            </small>
          </div>
        </div>
        <TeamMark team={player.team} />
      </div>

      <div className="signal-rail">
        {buildPlayerProfile(player).map((metric) => (
          <div key={metric.label} className="signal-row">
            <span className="mini-label">{metric.label}</span>
            <div className="signal-bar">
              <div className="signal-fill" style={{ width: `${metric.value}%` }} />
            </div>
            <strong>{Math.round(metric.value)}%</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

export function LandingPage({ data, selectedDate }) {
  const slate = useResearchSlate(selectedDate);
  const topBatter = firstOrNull(data.simulation?.slate?.top_batters || []);
  const topEdge = firstOrNull(data.markets || []);
  const featuredGame = firstOrNull(slate.data?.games || []);
  const gameOutlook = buildGameOutlook(data.simulation, data.contexts);
  const edgeDistribution = buildEdgeDistribution(data.markets);

  return (
    <div className="page-shell page-shell--landing">
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="section-eyebrow">Sports betting intelligence, reimagined</span>
          <h1>SPORTSSENSE AI helps users understand the slate, trust the signal, and act with conviction.</h1>
          <p className="landing-lead">
            Real-time MLB research rooms, branded matchup labs, team profiles, player deep dives, model-driven edge
            projections, and AI-guided context now live in a single product surface.
          </p>

          <div className="cta-row">
            <Link className="primary-button" to="/games">
              Open Matchup Labs
            </Link>
            <Link className="secondary-button" to="/players">
              Explore Player Research
            </Link>
            <Link className="ghost-button" to="/command-center">
              View Command Center
            </Link>
          </div>

          <div className="hero-stat-grid">
            <div className="hero-stat">
              <span className="mini-label">Tracked MLB games</span>
              <strong>{slate.data?.games?.length || 0}</strong>
            </div>
            <div className="hero-stat">
              <span className="mini-label">Positive-edge markets</span>
              <strong>{data.markets?.length || 0}</strong>
            </div>
            <div className="hero-stat">
              <span className="mini-label">AI state</span>
              <strong>{data.health?.ok ? "Live" : "Syncing"}</strong>
            </div>
            <div className="hero-stat">
              <span className="mini-label">Featured matchup</span>
              <strong>{featuredGame ? featuredGame.matchupLabel : "Loading slate"}</strong>
            </div>
          </div>
        </div>

        <div className="landing-visual">
          <div className="brand-scene">
            <div className="brand-scene-grid" />
            <img className="brand-scene-main" src="/brand/growth-connectivity-icon.png" alt="SportsSense AI hero icon" />
            <div className="brand-scene-bars">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="brand-scene-copy">
              <img src="/brand/sportssense-circuit-logo.png" alt="SportsSense AI mark" />
            </div>
          </div>

          <div className="wireframe-card">
            <span className="mini-label">Wireframe direction</span>
            <img src="/brand/figma-wireframe-display.png" alt="SportsSense AI wireframe system" />
          </div>
        </div>
      </section>

      <div className="story-strip">
        <article className="story-card">
          <span className="card-tag">Top live signal</span>
          <strong>{topBatter ? `${topBatter.player_name} ${fmtPercent(topBatter.P_hrh_2p)}` : "Waiting on model"}</strong>
          <p>Model-derived batting signal with matchup context, prop ladder, and full player drill-down.</p>
        </article>
        <article className="story-card">
          <span className="card-tag">Research workflow</span>
          <strong>Teams → Matchups → Players → Markets</strong>
          <p>The product now lets users move from macro slate context to player-level detail without losing continuity.</p>
        </article>
        <article className="story-card">
          <span className="card-tag">Largest edge</span>
          <strong>{topEdge ? `${topEdge.player_name} ${fmtSignedPercent(topEdge.edge)}` : "Loading edge board"}</strong>
          <p>Clearer edge surfacing, decision support, bankroll framing, and AI explanation in one interface.</p>
        </article>
      </div>

      <div className="platform-grid">
        <article className="platform-card">
          <span className="mini-label">Matchup Labs</span>
          <strong>Starting pitcher vs lineup context</strong>
          <p>Probable-pitcher duel cards, team-vs-hand splits, venue context, and click-through player research.</p>
        </article>
        <article className="platform-card">
          <span className="mini-label">Team Profiles</span>
          <strong>Brand-complete roster pages</strong>
          <p>Logos, color systems, active rosters, hitter and pitcher tables, and split-aware team snapshots.</p>
        </article>
        <article className="platform-card">
          <span className="mini-label">Player Research</span>
          <strong>Season, recent form, and head-to-head</strong>
          <p>Current season stats, last 3/5/10 windows, split toggles, and batter-vs-pitcher history where available.</p>
        </article>
      </div>

      <div className="two-column">
        <PagePanel eyebrow="Slate pressure" title="Projected Game Environment" description="Simulated total environment over the current board.">
          {renderChart(
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={gameOutlook}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="matchup" tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar yAxisId="left" dataKey="projected_total" fill="#2DA8FF" radius={[10, 10, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="run_environment" stroke="#FF8A00" strokeWidth={3} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </PagePanel>

        <PagePanel eyebrow="Edge density" title="Top Opportunity Distribution" description="Positive-edge positions surfaced by the current market engine.">
          {renderChart(
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={edgeDistribution} layout="vertical" margin={{ left: 10, right: 10 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={110} />
                <Tooltip />
                <Bar dataKey="edge" radius={[0, 10, 10, 0]}>
                  {edgeDistribution.map((entry, index) => (
                    <Cell key={entry.label} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </PagePanel>
      </div>

      <PagePanel eyebrow="Splash direction" title="3.6-second motion sequence" description="The landing experience is styled around the grid, circuit, globe, bars, and arrow motif from the provided design brief.">
        <div className="story-strip">
          <article className="detail-card">
            <span className="detail-label">01</span>
            <strong>Grid fades in</strong>
            <p>Backdrop grid and radial glow establish the product as a data-first interface.</p>
          </article>
          <article className="detail-card">
            <span className="detail-label">02</span>
            <strong>Circuit lines activate</strong>
            <p>Orange and blue traces animate through the hero scene to echo the brand assets you provided.</p>
          </article>
          <article className="detail-card">
            <span className="detail-label">03</span>
            <strong>Bars rise and arrow sweeps</strong>
            <p>The hero icon treatment visually reinforces growth, edge discovery, and confident action.</p>
          </article>
        </div>
      </PagePanel>
    </div>
  );
}

export function CommandCenterPage({ data, selectedDate }) {
  const [question, setQuestion] = useState("Who has the strongest total-base edge on this slate?");
  const [answer, setAnswer] = useState("");
  const [warning, setWarning] = useState("");
  const [thinking, setThinking] = useState(false);

  const topBatter = firstOrNull(data.simulation?.slate?.top_batters || []);
  const topPitcher = firstOrNull(data.simulation?.slate?.top_pitchers || []);
  const topEdge = firstOrNull(data.markets || []);
  const topRisk = firstOrNull(data.risk?.recommendations || []);
  const gameOutlook = buildGameOutlook(data.simulation, data.contexts);
  const calibrationSeries = buildCalibrationSeries(data.calibration);
  const edgeDistribution = buildEdgeDistribution(data.markets);

  async function handleAsk() {
    setThinking(true);
    setWarning("");
    try {
      const result = await askAi(question, selectedDate);
      setAnswer(result.answer || "No answer returned.");
      setWarning(result.warning || "");
    } catch (error) {
      setAnswer("");
      setWarning(error instanceof Error ? error.message : "The AI route is temporarily unavailable.");
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="metric-grid">
        <MetricCard label="Top batter" value={topBatter ? topBatter.player_name : "Loading"} note={topBatter ? fmtPercent(topBatter.P_hrh_2p) : "Waiting for slate"} />
        <MetricCard label="Top pitcher" value={topPitcher ? topPitcher.player_name : "Loading"} note={topPitcher ? `${fmtDecimal(topPitcher.k_proj)} K proj` : "Waiting for slate"} />
        <MetricCard label="Largest edge" value={topEdge ? fmtSignedPercent(topEdge.edge) : "Loading"} note={topEdge ? `${topEdge.player_name} ${topEdge.prop_type}` : "Waiting for markets"} />
        <MetricCard label="Stake cap" value={topRisk ? `$${Math.round(topRisk.capped_stake)}` : "Loading"} note={topRisk ? `${topRisk.player_name} recommendation` : "Waiting for risk"} />
      </div>

      <div className="two-column">
        <PagePanel eyebrow="Slate shape" title="Projected Game Totals" description="Projected totals and environment pressure across the current MLB board.">
          {renderChart(
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={gameOutlook}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="matchup" tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar yAxisId="left" dataKey="projected_total" fill="#2DA8FF" radius={[10, 10, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="run_environment" stroke="#FF8A00" strokeWidth={3} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </PagePanel>

        <PagePanel eyebrow="Model health" title="Calibration Track" description="Projected versus actual outcome rate across the HRH bucket curve.">
          {renderChart(
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={calibrationSeries}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="projected" stroke="#2DA8FF" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="actual" stroke="#18C37E" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </PagePanel>
      </div>

      <div className="two-column">
        <PagePanel eyebrow="Opportunity board" title="Top Edge Distribution" description="Highest positive-edge positions currently available through the market engine.">
          {renderChart(
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={edgeDistribution} layout="vertical" margin={{ left: 10, right: 10 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={110} />
                <Tooltip />
                <Bar dataKey="edge" radius={[0, 10, 10, 0]}>
                  {edgeDistribution.map((entry, index) => (
                    <Cell key={entry.label} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </PagePanel>

        <PagePanel eyebrow="AI copilot" title="Slate Questioning" description="Use the live AI route to summarize the best betting angles in plain language.">
          <div className="field-stack">
            <span className="mini-label">Prompt</span>
            <textarea value={question} rows={5} onChange={(event) => setQuestion(event.target.value)} />
          </div>
          <div className="cta-row">
            <button className="primary-button" type="button" onClick={handleAsk} disabled={thinking}>
              {thinking ? "Thinking..." : "Run AI Analysis"}
            </button>
          </div>
          {warning ? <div className="warning-banner">{warning}</div> : null}
          <div className="detail-card">
            <span className="detail-label">Response</span>
            <strong>{answer || "Ask for a slate read, player angle, or quick explanation."}</strong>
            <p>The response is coming through the live SportsSense AI analysis pipeline.</p>
          </div>
        </PagePanel>
      </div>
    </div>
  );
}

export function TeamsPage({ selectedDate }) {
  const slate = useResearchSlate(selectedDate);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [view, setView] = useState("hitters");

  const teams = (slate.data?.games || []).flatMap((game) => [game.awayTeam, game.homeTeam]).reduce((accumulator, team) => {
    if (!team?.id || accumulator.some((entry) => entry.id === team.id)) {
      return accumulator;
    }
    return [...accumulator, team];
  }, []);

  useEffect(() => {
    if (!selectedTeamId && teams.length > 0) {
      setSelectedTeamId(teams[0].id);
    }
  }, [selectedTeamId, teams]);

  const research = useTeamResearch(selectedTeamId, selectedDate);
  const team = research.data?.team || null;
  const matchup = research.data?.matchup || null;
  const opponentTeamId = matchup
    ? matchup.awayTeam?.id === team?.id
      ? matchup.homeTeam?.id
      : matchup.awayTeam?.id
    : null;
  const opposingPitcherId = matchup
    ? matchup.awayTeam?.id === team?.id
      ? matchup.probablePitchers?.home?.id
      : matchup.probablePitchers?.away?.id
    : null;
  const rosterCards = view === "hitters" ? research.data?.hitting?.players || [] : research.data?.pitching?.players || [];
  const splitSet = view === "hitters" ? research.data?.hitting?.splitsByCode || {} : research.data?.pitching?.splitsByCode || {};

  return (
    <div className="page-shell">
      <section className="research-hero">
        <div>
          <span className="section-eyebrow">Team research</span>
          <h2>{team ? team.name : "Select a team from the active slate"}</h2>
          <p>
            Full team profiles with logos, color identity, active roster context, season tables, and split-aware matchup framing.
          </p>
        </div>

        <div className="selector-bar">
          <label className="field-stack">
            <span className="mini-label">Active team</span>
            <select value={selectedTeamId || ""} onChange={(event) => setSelectedTeamId(Number(event.target.value))}>
              {teams.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <div className="team-toggle-row">
            <button className={`team-toggle${view === "hitters" ? " is-active" : ""}`} type="button" onClick={() => setView("hitters")}>
              Hitters
            </button>
            <button className={`team-toggle${view === "pitching" ? " is-active" : ""}`} type="button" onClick={() => setView("pitching")}>
              Pitchers
            </button>
          </div>
        </div>
      </section>

      {slate.loading ? <ResearchLoading message="Loading official MLB slate..." /> : null}
      {slate.error ? <div className="warning-banner">Slate research warning: {slate.error}</div> : null}
      {research.loading ? <ResearchLoading message="Loading team profile..." /> : null}
      {research.error ? <div className="warning-banner">Team research warning: {research.error}</div> : null}

      {team ? (
        <>
          <div className="metric-grid">
            <MetricCard label="Record" value={formatRecord(team)} note={team.division || "Division pending"} />
            <MetricCard label="Venue" value={team.venue || "Venue TBD"} note={team.league || "League pending"} />
            <MetricCard label="Matchup" value={matchup ? matchup.matchupLabel : "Off slate"} note={matchup ? formatGameTime(matchup.gameDate) : "No game on selected date"} />
            <MetricCard label="Roster size" value={String(research.data?.roster?.length || 0)} note="Active profile rows" />
          </div>

          <div className="two-column">
            <PagePanel eyebrow="Team identity" title={team.name} description="Brand-complete profile for the selected MLB team.">
              <div className="team-showcase">
                <TeamMark team={team} />
                <div className="detail-card">
                  <span className="detail-label">Club profile</span>
                  <strong className="detail-card-value">{team.shortName}</strong>
                  <p>
                    {team.locationName || team.name} • {team.league || "League"} • {team.division || "Division"}
                  </p>
                </div>
              </div>
            </PagePanel>

            <PagePanel eyebrow="Split intelligence" title={view === "hitters" ? "Batting split board" : "Pitching split board"} description="Toggle between handedness and home/away split context.">
              <div className="split-grid">
                <SplitInsightCard label="Vs Left" split={splitSet.vl} />
                <SplitInsightCard label="Vs Right" split={splitSet.vr} />
                <SplitInsightCard label="Home" split={splitSet.gh} />
                <SplitInsightCard label="Away" split={splitSet.ga} />
              </div>
            </PagePanel>
          </div>

          {matchup ? (
            <PagePanel eyebrow="Current opponent" title={`${team.shortName} matchup context`} description="The team page stays anchored to the selected date so research remains matchup-aware.">
              <div className="story-strip">
                <article className="detail-card">
                  <span className="detail-label">Opponent</span>
                  <strong>{getTeamLabel(matchup.awayTeam?.id === team.id ? matchup.homeTeam : matchup.awayTeam)}</strong>
                  <p>{formatGameTime(matchup.gameDate)}</p>
                </article>
                <article className="detail-card">
                  <span className="detail-label">Starter</span>
                  <strong>
                    {matchup.awayTeam?.id === team.id ? matchup.probablePitchers?.away?.fullName || "TBD" : matchup.probablePitchers?.home?.fullName || "TBD"}
                  </strong>
                  <p>Projected starter for the selected club.</p>
                </article>
                <article className="detail-card">
                  <span className="detail-label">Opposing starter</span>
                  <strong>{matchup.awayTeam?.id === team.id ? matchup.probablePitchers?.home?.fullName || "TBD" : matchup.probablePitchers?.away?.fullName || "TBD"}</strong>
                  <p>Linked into batter-vs-pitcher and team-vs-hand player research.</p>
                </article>
              </div>
            </PagePanel>
          ) : null}

          <PagePanel eyebrow="Roster lab" title={view === "hitters" ? "Hitter profiles" : "Pitcher profiles"} description="Select any athlete to jump into the full player research page.">
            <div className="roster-grid">
              {rosterCards.slice(0, 18).map((player) => (
                <RosterResearchCard
                  key={player.playerId}
                  player={player}
                  to={buildPlayerLink({
                    gamePk: matchup?.gamePk,
                    teamId: team.id,
                    playerId: player.playerId,
                    opponentTeamId,
                    opposingPitcherId
                  })}
                />
              ))}
            </div>
          </PagePanel>
        </>
      ) : (
        <EmptyState>Select an active team to open the full research profile.</EmptyState>
      )}
    </div>
  );
}

export function GamesPage({ data, selectedDate }) {
  const slate = useResearchSlate(selectedDate);
  const [selectedGamePk, setSelectedGamePk] = useState(null);
  const [selectedScheduleGameId, setSelectedScheduleGameId] = useState(null);

  useEffect(() => {
    if (!selectedGamePk && slate.data?.games?.length > 0) {
      setSelectedGamePk(slate.data.games[0].gamePk);
    }
  }, [selectedGamePk, slate.data]);

  useEffect(() => {
    const scheduleGames = data.schedule?.games || [];
    if (!selectedScheduleGameId && scheduleGames.length > 0) {
      setSelectedScheduleGameId(scheduleGames[0].gameId);
      return;
    }

    if (selectedScheduleGameId && scheduleGames.every((game) => String(game.gameId) !== String(selectedScheduleGameId))) {
      setSelectedScheduleGameId(scheduleGames[0]?.gameId || null);
    }
  }, [data.schedule, selectedScheduleGameId]);

  const games = slate.data?.games || [];
  const matchup = games.find((game) => Number(game.gamePk) === Number(selectedGamePk)) || firstOrNull(games);
  const scheduleGames = data.schedule?.games || [];
  const featuredScheduleGame =
    scheduleGames.find((game) => String(game.gameId) === String(selectedScheduleGameId)) || firstOrNull(scheduleGames);
  const awayResearch = useTeamResearch(matchup?.awayTeam?.id, selectedDate);
  const homeResearch = useTeamResearch(matchup?.homeTeam?.id, selectedDate);
  const awayStarter = usePlayerResearch(matchup?.probablePitchers?.away?.id, selectedDate, matchup?.homeTeam?.id, null);
  const homeStarter = usePlayerResearch(matchup?.probablePitchers?.home?.id, selectedDate, matchup?.awayTeam?.id, null);
  const awayTargetSplit = homeResearch.data?.hitting?.splitsByCode?.[handToSplitCode(awayStarter.data?.player?.throws)];
  const homeTargetSplit = awayResearch.data?.hitting?.splitsByCode?.[handToSplitCode(homeStarter.data?.player?.throws)];
  const matchupBoard = buildMatchupBoardRows(games, data.contexts);
  const scatterData = buildRunEnvironmentScatter(data.simulation, data.contexts);
  const oddsInsights = useGameOddsInsights(featuredScheduleGame?.gameId, selectedDate);
  const oddsHistorySeries = buildOddsHistorySeries(oddsInsights.history);
  const scheduleRoute = getRouteAudit(data.dataHealth, "/schedule/mlb");
  const gameOddsRoute = getRouteAudit(data.dataHealth, "/games/mlb/:gameId/odds");
  const gameOddsHistoryRoute = getRouteAudit(data.dataHealth, "/games/mlb/:gameId/odds/history");
  const gameOddsMovementRoute = getRouteAudit(data.dataHealth, "/games/mlb/:gameId/odds/movement");
  const gameStreamsRoute = getRouteAudit(data.dataHealth, "/games/mlb/:gameId/streams");

  return (
    <div className="page-shell">
      <section className="research-hero">
        <div>
          <span className="section-eyebrow">Matchup labs</span>
          <h2>{matchup ? matchup.matchupLabel : "Select a game"}</h2>
          <p>Starting pitcher context, team-vs-hand splits, venue, timing, and click-through player research from the full matchup board.</p>
        </div>
      </section>

      {slate.loading ? <ResearchLoading message="Loading official MLB scoreboard..." /> : null}
      {slate.error ? <div className="warning-banner">Matchup slate warning: {slate.error}</div> : null}

      <PagePanel
        eyebrow="Live scoreboard"
        title="ESPN slate + live game pricing"
        description="The operational scoreboard now comes directly from ESPN's live header feed, with status, venue, stream surface, and normalized DraftKings odds."
        action={<SourceBadge route={scheduleRoute} />}
      >
        {scheduleGames.length > 0 ? (
          <>
            <div className="matchup-selector-grid">
              {scheduleGames.map((game) => (
                <ScoreboardMatchupTile
                  key={game.gameId}
                  game={game}
                  isActive={String(game.gameId) === String(featuredScheduleGame?.gameId)}
                  onSelect={() => setSelectedScheduleGameId(game.gameId)}
                />
              ))}
            </div>

            {featuredScheduleGame ? (
              <>
                <div className="metric-grid">
                  <MetricCard label="Featured matchup" value={scheduleMatchupLabel(featuredScheduleGame)} note={formatGameTime(featuredScheduleGame.startTime)} />
                  <MetricCard label="Status" value={String(featuredScheduleGame.status || "UNKNOWN").replace(/_/g, " ")} note={featuredScheduleGame.summary || "Awaiting update"} />
                  <MetricCard
                    label="Score"
                    value={`${featuredScheduleGame.teams?.away?.score ?? "-"}-${featuredScheduleGame.teams?.home?.score ?? "-"}`}
                    note={`${featuredScheduleGame.teams?.away?.abbreviation || "Away"} at ${featuredScheduleGame.teams?.home?.abbreviation || "Home"}`}
                  />
                  <MetricCard
                    label="Provider"
                    value={featuredScheduleGame.odds?.provider?.name || "Odds pending"}
                    note={featuredScheduleGame.location || "Venue TBD"}
                  />
                </div>

                <div className="two-column">
                  <PagePanel
                    eyebrow="Market snapshot"
                    title="Open, close, and latest game price"
                    description="Moneyline, total, and runline are normalized into a stable game object so we can surface the exact book state on the game view."
                    action={<SourceBadge route={gameOddsRoute} />}
                  >
                    {featuredScheduleGame.odds ? (
                      <div className="detail-grid">
                        <div className="detail-card">
                          <span className="detail-label">{featuredScheduleGame.teams?.away?.abbreviation || "Away"} moneyline</span>
                          <strong className="detail-card-value">{formatMoneylineMove(featuredScheduleGame.odds.moneyline.away)}</strong>
                          <p>Latest: {fmtOptionalMoneyline(currentMoneyline(featuredScheduleGame.odds.moneyline.away))}</p>
                        </div>
                        <div className="detail-card">
                          <span className="detail-label">{featuredScheduleGame.teams?.home?.abbreviation || "Home"} moneyline</span>
                          <strong className="detail-card-value">{formatMoneylineMove(featuredScheduleGame.odds.moneyline.home)}</strong>
                          <p>Latest: {fmtOptionalMoneyline(currentMoneyline(featuredScheduleGame.odds.moneyline.home))}</p>
                        </div>
                        <div className="detail-card">
                          <span className="detail-label">Total</span>
                          <strong className="detail-card-value">{formatPointMove(featuredScheduleGame.odds.total.over, false)}</strong>
                          <p>
                            Over {fmtOptionalMoneyline(currentPointOdds(featuredScheduleGame.odds.total.over))} / Under{" "}
                            {fmtOptionalMoneyline(currentPointOdds(featuredScheduleGame.odds.total.under))}
                          </p>
                        </div>
                        <div className="detail-card">
                          <span className="detail-label">Runline</span>
                          <strong className="detail-card-value">{formatPointMove(featuredScheduleGame.odds.spread.home, true)}</strong>
                          <p>
                            {featuredScheduleGame.teams?.home?.abbreviation || "Home"} {formatPointValue(featuredScheduleGame.odds.spread.home, true)} /{" "}
                            {featuredScheduleGame.teams?.away?.abbreviation || "Away"} {formatPointValue(featuredScheduleGame.odds.spread.away, true)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <EmptyState>Odds have not been posted for this matchup yet.</EmptyState>
                    )}
                  </PagePanel>

                  <PagePanel
                    eyebrow="Watch surface"
                    title="Stream and broadcast distribution"
                    description="National and local availability stay tied to the same live event object so game status and watch options update together."
                    action={<SourceBadge route={gameStreamsRoute} />}
                  >
                    <div className="detail-grid">
                      <div className="detail-card">
                        <span className="detail-label">Live availability</span>
                        <strong className="detail-card-value">{featuredScheduleGame.stream?.isLive ? "Live" : "Not live"}</strong>
                        <p>{featuredScheduleGame.stream?.isReplayAvailable ? "Replay available" : "Replay not listed yet"}</p>
                      </div>
                      <div className="detail-card">
                        <span className="detail-label">Requirements</span>
                        <strong className="detail-card-value">
                          {featuredScheduleGame.stream?.requires?.espnPlus ? "ESPN+" : "Standard access"}
                        </strong>
                        <p>{featuredScheduleGame.stream?.requires?.cableLogin ? "Cable login required" : "No cable login flag detected"}</p>
                      </div>
                      <div className="detail-card">
                        <span className="detail-label">Primary watch link</span>
                        <strong className="detail-card-value">
                          {featuredScheduleGame.stream?.links?.web ? (
                            <a className="utility-link" href={featuredScheduleGame.stream.links.web} target="_blank" rel="noreferrer">
                              Open stream menu
                            </a>
                          ) : (
                            "Unavailable"
                          )}
                        </strong>
                        <p>{featuredScheduleGame.broadcast || `${featuredScheduleGame.stream?.broadcasts?.length || 0} listed feeds`}</p>
                      </div>
                      <div className="detail-card">
                        <span className="detail-label">Broadcasts</span>
                        <div className="chip-stack">
                          {(featuredScheduleGame.stream?.broadcasts || []).slice(0, 4).map((broadcast) => (
                            <span key={`${broadcast.name}-${broadcast.slug || broadcast.type}`} className="stat-chip">
                              {broadcast.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </PagePanel>
                </div>

                {oddsInsights.error ? <div className="warning-banner">Odds insights warning: {oddsInsights.error}</div> : null}

                <div className="two-column">
                  <PagePanel
                    eyebrow="Odds history"
                    title="Moneyline timeline"
                    description="Every persisted odds snapshot for the selected game, ordered oldest to newest, so we can see the live moneyline path instead of only the latest price."
                    action={<SourceBadge route={gameOddsHistoryRoute} />}
                  >
                    {oddsInsights.loading ? (
                      <ResearchLoading message="Loading odds history..." />
                    ) : oddsHistorySeries.length > 0 ? (
                      renderChart(
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={oddsHistorySeries}>
                            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} />
                            <YAxis tickLine={false} axisLine={false} />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="awayMoneyline" name={`${featuredScheduleGame.teams?.away?.abbreviation || "Away"} ML`} stroke="#2DA8FF" strokeWidth={3} dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="homeMoneyline" name={`${featuredScheduleGame.teams?.home?.abbreviation || "Home"} ML`} stroke="#FF8A00" strokeWidth={3} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      )
                    ) : (
                      <EmptyState>No odds history snapshots have been captured for this game yet.</EmptyState>
                    )}
                  </PagePanel>

                  <PagePanel
                    eyebrow="Line movement"
                    title="Open-to-latest movement summary"
                    description="This derived layer turns the persisted history into direct open-versus-latest deltas for moneyline, total, and runline."
                    action={<SourceBadge route={gameOddsMovementRoute} />}
                  >
                    {oddsInsights.loading ? (
                      <ResearchLoading message="Loading movement summary..." />
                    ) : oddsInsights.movement ? (
                      <div className="detail-grid">
                        <div className="detail-card">
                          <span className="detail-label">Home moneyline</span>
                          <strong className="detail-card-value">
                            {formatMoneylineMove({
                              open: oddsInsights.movement.moneyline?.home?.open,
                              current: oddsInsights.movement.moneyline?.home?.latest
                            })}
                          </strong>
                          <p>Delta {fmtOptionalMoneyline(oddsInsights.movement.moneyline?.home?.delta)}</p>
                        </div>
                        <div className="detail-card">
                          <span className="detail-label">Away moneyline</span>
                          <strong className="detail-card-value">
                            {formatMoneylineMove({
                              open: oddsInsights.movement.moneyline?.away?.open,
                              current: oddsInsights.movement.moneyline?.away?.latest
                            })}
                          </strong>
                          <p>Delta {fmtOptionalMoneyline(oddsInsights.movement.moneyline?.away?.delta)}</p>
                        </div>
                        <div className="detail-card">
                          <span className="detail-label">Total line</span>
                          <strong className="detail-card-value">
                            {formatPointMove(
                              {
                                open: { line: oddsInsights.movement.total?.line?.open },
                                current: { line: oddsInsights.movement.total?.line?.latest }
                              },
                              false
                            )}
                          </strong>
                          <p>Over odds delta {fmtOptionalMoneyline(oddsInsights.movement.total?.overOdds?.delta)}</p>
                        </div>
                        <div className="detail-card">
                          <span className="detail-label">Runline</span>
                          <strong className="detail-card-value">
                            {formatPointMove(
                              {
                                open: {
                                  line: oddsInsights.movement.spread?.home?.open?.line,
                                  odds: oddsInsights.movement.spread?.home?.open?.odds
                                },
                                current: {
                                  line: oddsInsights.movement.spread?.home?.latest?.line,
                                  odds: oddsInsights.movement.spread?.home?.latest?.odds
                                }
                              },
                              true
                            )}
                          </strong>
                          <p>Samples tracked: {oddsInsights.movement.samples || 0}</p>
                        </div>
                      </div>
                    ) : (
                      <EmptyState>No movement summary is available yet for this game.</EmptyState>
                    )}
                  </PagePanel>
                </div>
              </>
            ) : null}
          </>
        ) : (
          <EmptyState>No schedule rows were returned for this slate yet.</EmptyState>
        )}
      </PagePanel>

      <div className="matchup-selector-grid">
        {games.map((game) => (
          <MatchupTile key={game.gamePk} game={game} isActive={Number(game.gamePk) === Number(matchup?.gamePk)} onSelect={() => setSelectedGamePk(game.gamePk)} />
        ))}
      </div>

      {matchup ? (
        <>
          <PagePanel
            eyebrow="Matchup board"
            title="Full slate matchup table"
            description="A research-first board with first pitch, venue, starters, run environment, and confidence stacked into one operational view."
            action={<SourceBadge route={getRouteAudit(data.dataHealth, "/game-context/mlb")} />}
          >
            <div className="table-shell table-shell--dense">
              <div className="table-row table-row--header table-row--matchups">
                <span>Matchup</span>
                <span>First pitch</span>
                <span>Venue</span>
                <span>Starters</span>
                <span>Run env</span>
                <span>Confidence</span>
              </div>
              {matchupBoard.map((row) => (
                <button key={row.gamePk} className={`table-row table-row--matchups${Number(row.gamePk) === Number(matchup?.gamePk) ? " is-active" : ""}`} type="button" onClick={() => setSelectedGamePk(row.gamePk)}>
                  <strong>{row.matchup}</strong>
                  <span>{row.firstPitch}</span>
                  <span>{row.venue}</span>
                  <span>
                    {row.starterAway} / {row.starterHome}
                  </span>
                  <span>{fmtDecimal(row.run_environment)}</span>
                  <span>{fmtDecimal(row.confidence)}%</span>
                </button>
              ))}
            </div>
          </PagePanel>

          <div className="metric-grid">
            <MetricCard label="Away" value={matchup.awayTeam.name} note={formatRecord(matchup.awayTeam)} />
            <MetricCard label="Home" value={matchup.homeTeam.name} note={formatRecord(matchup.homeTeam)} />
            <MetricCard label="Venue" value={matchup.venue?.name || "Venue TBD"} note={formatGameTime(matchup.gameDate)} />
            <MetricCard label="Status" value={matchup.status?.detail || "Scheduled"} note={matchup.dayNight || "Game window"} />
          </div>

          <PagePanel eyebrow="Run environment" title="Total projection vs environment pressure" description="Games with the highest modeled total and contextual pressure rise to the top of the slate.">
            {scatterData.length > 0 ? (
              renderChart(
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 12, bottom: 12, left: 12 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                    <XAxis type="number" dataKey="projected_total" name="Projected total" tickLine={false} axisLine={false} />
                    <YAxis type="number" dataKey="run_environment" name="Run environment" tickLine={false} axisLine={false} />
                    <ZAxis type="number" dataKey="confidence" range={[80, 260]} />
                    <Tooltip cursor={{ strokeDasharray: "4 4" }} />
                    <Scatter data={scatterData} fill="#FF8A00" />
                  </ScatterChart>
                </ResponsiveContainer>
              )
            ) : (
              <EmptyState>No game context points are available for the selected slate.</EmptyState>
            )}
          </PagePanel>

          <div className="two-column">
            <PagePanel eyebrow="Probable pitcher duel" title={`${matchup.awayTeam.shortName} starter`} description="Current season and recent-form context for the away probable pitcher.">
              {awayStarter.loading ? (
                <ResearchLoading message="Loading away starter..." />
              ) : awayStarter.data ? (
                <div className="stack-block">
                  <div className="player-summary">
                    <PlayerPortrait player={awayStarter.data.player} />
                    <div>
                      <strong>{awayStarter.data.player.fullName}</strong>
                      <small>{awayStarter.data.player.throwsDescription || awayStarter.data.player.throws} throwing</small>
                    </div>
                  </div>
                  <div className="detail-grid">
                    {buildPlayerMetricCards(awayStarter.data).map((card) => (
                      <div key={card.label} className="detail-card">
                        <span className="detail-label">{card.label}</span>
                        <strong className="detail-card-value">{card.value}</strong>
                        <p>{card.note}</p>
                      </div>
                    ))}
                  </div>
                  <SplitInsightCard label="Opponent lineup vs hand" split={awayTargetSplit} pitcherHandNote={`${matchup.homeTeam.shortName} batting vs ${awayStarter.data.player.throws || "R"}HP`} />
                </div>
              ) : (
                <EmptyState>No away probable pitcher returned for this matchup.</EmptyState>
              )}
            </PagePanel>

            <PagePanel eyebrow="Probable pitcher duel" title={`${matchup.homeTeam.shortName} starter`} description="Current season and recent-form context for the home probable pitcher.">
              {homeStarter.loading ? (
                <ResearchLoading message="Loading home starter..." />
              ) : homeStarter.data ? (
                <div className="stack-block">
                  <div className="player-summary">
                    <PlayerPortrait player={homeStarter.data.player} />
                    <div>
                      <strong>{homeStarter.data.player.fullName}</strong>
                      <small>{homeStarter.data.player.throwsDescription || homeStarter.data.player.throws} throwing</small>
                    </div>
                  </div>
                  <div className="detail-grid">
                    {buildPlayerMetricCards(homeStarter.data).map((card) => (
                      <div key={card.label} className="detail-card">
                        <span className="detail-label">{card.label}</span>
                        <strong className="detail-card-value">{card.value}</strong>
                        <p>{card.note}</p>
                      </div>
                    ))}
                  </div>
                  <SplitInsightCard label="Opponent lineup vs hand" split={homeTargetSplit} pitcherHandNote={`${matchup.awayTeam.shortName} batting vs ${homeStarter.data.player.throws || "R"}HP`} />
                </div>
              ) : (
                <EmptyState>No home probable pitcher returned for this matchup.</EmptyState>
              )}
            </PagePanel>
          </div>

          <div className="two-column">
            <PagePanel eyebrow="Away roster" title={matchup.awayTeam.name} description="Click a player to open the full individual research page.">
              <div className="roster-grid roster-grid--dense">
                {(awayResearch.data?.roster || []).slice(0, 16).map((player) => (
                  <RosterResearchCard
                    key={player.id}
                    player={player}
                    to={buildPlayerLink({
                      gamePk: matchup.gamePk,
                      teamId: matchup.awayTeam.id,
                      playerId: player.id,
                      opponentTeamId: matchup.homeTeam.id,
                      opposingPitcherId: matchup.probablePitchers?.home?.id
                    })}
                  />
                ))}
              </div>
            </PagePanel>

            <PagePanel eyebrow="Home roster" title={matchup.homeTeam.name} description="Click a player to open the full individual research page.">
              <div className="roster-grid roster-grid--dense">
                {(homeResearch.data?.roster || []).slice(0, 16).map((player) => (
                  <RosterResearchCard
                    key={player.id}
                    player={player}
                    to={buildPlayerLink({
                      gamePk: matchup.gamePk,
                      teamId: matchup.homeTeam.id,
                      playerId: player.id,
                      opponentTeamId: matchup.awayTeam.id,
                      opposingPitcherId: matchup.probablePitchers?.away?.id
                    })}
                  />
                ))}
              </div>
            </PagePanel>
          </div>
        </>
      ) : (
        <EmptyState>No matchup is available for the selected date.</EmptyState>
      )}
    </div>
  );
}

export function PlayersPage({ data, selectedDate }) {
  const [searchParams] = useSearchParams();
  const slate = useResearchSlate(selectedDate);
  const [selectedGamePk, setSelectedGamePk] = useState(searchParams.get("gamePk") || "");
  const [selectedTeamId, setSelectedTeamId] = useState(searchParams.get("teamId") || "");
  const [selectedPlayerId, setSelectedPlayerId] = useState(searchParams.get("playerId") || "");

  useEffect(() => {
    if (!selectedGamePk && slate.data?.games?.length > 0) {
      setSelectedGamePk(String(slate.data.games[0].gamePk));
    }
  }, [selectedGamePk, slate.data]);

  const matchup = (slate.data?.games || []).find((game) => String(game.gamePk) === String(selectedGamePk)) || firstOrNull(slate.data?.games || []);

  useEffect(() => {
    if (matchup && (!selectedTeamId || ![String(matchup.awayTeam?.id), String(matchup.homeTeam?.id)].includes(String(selectedTeamId)))) {
      setSelectedTeamId(String(matchup.awayTeam?.id || ""));
    }
  }, [matchup, selectedTeamId]);

  const teamResearch = useTeamResearch(Number(selectedTeamId || 0), selectedDate);
  const roster = teamResearch.data?.roster || [];

  useEffect(() => {
    if (!selectedPlayerId && roster.length > 0) {
      setSelectedPlayerId(String(roster[0].id));
    }
  }, [selectedPlayerId, roster]);

  const opponentTeamId = matchup
    ? Number(selectedTeamId) === Number(matchup.awayTeam?.id)
      ? matchup.homeTeam?.id
      : matchup.awayTeam?.id
    : null;
  const opposingPitcherId = matchup
    ? Number(selectedTeamId) === Number(matchup.awayTeam?.id)
      ? matchup.probablePitchers?.home?.id
      : matchup.probablePitchers?.away?.id
    : null;
  const playerResearch = usePlayerResearch(Number(selectedPlayerId || 0), selectedDate, opponentTeamId, opposingPitcherId);
  const trendData = buildPlayerTrend(playerResearch.data);
  const recentRows = buildRecentGameRows(playerResearch.data);
  const splitRows = playerResearch.data?.splits?.byCode || {};
  const metricCards = buildPlayerMetricCards(playerResearch.data);
  const isPitcher = isPitcherProfile(playerResearch.data);

  return (
    <div className="page-shell">
      <section className="research-hero">
        <div>
          <span className="section-eyebrow">Player research</span>
          <h2>{playerResearch.data?.player?.fullName || "Select a player from the active slate"}</h2>
          <p>Season stats, recent windows, head-to-head context, and split toggles designed for real pre-bet research.</p>
        </div>
      </section>

      <div className="selector-bar selector-bar--triple">
        <label className="field-stack">
          <span className="mini-label">Matchup</span>
          <select value={selectedGamePk} onChange={(event) => setSelectedGamePk(event.target.value)}>
            {(slate.data?.games || []).map((game) => (
              <option key={game.gamePk} value={game.gamePk}>
                {game.matchupLabel}
              </option>
            ))}
          </select>
        </label>

        <label className="field-stack">
          <span className="mini-label">Team</span>
          <select value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)}>
            {matchup ? (
              <>
                <option value={matchup.awayTeam?.id}>{matchup.awayTeam?.name}</option>
                <option value={matchup.homeTeam?.id}>{matchup.homeTeam?.name}</option>
              </>
            ) : null}
          </select>
        </label>

        <label className="field-stack">
          <span className="mini-label">Player</span>
          <select value={selectedPlayerId} onChange={(event) => setSelectedPlayerId(event.target.value)}>
            {roster.map((player) => (
              <option key={player.id} value={player.id}>
                {player.fullName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {playerResearch.loading ? <ResearchLoading message="Loading player research..." /> : null}
      {playerResearch.error ? <div className="warning-banner">Player research warning: {playerResearch.error}</div> : null}

      {playerResearch.data?.player ? (
        <>
          <section className="player-research-header">
            <div className="player-research-summary">
              <PlayerPortrait player={playerResearch.data.player} />
              <div>
                <span className="section-eyebrow">{playerResearch.data.player.primaryPosition?.abbreviation || "MLB"}</span>
                <h3>{playerResearch.data.player.fullName}</h3>
                <p>
                  {playerResearch.data.player.currentTeam?.name || "Current team"} • Bats {playerResearch.data.player.bats || "--"} / Throws{" "}
                  {playerResearch.data.player.throws || "--"} • {playerResearch.data.player.height || "Height"} • {playerResearch.data.player.weight || "--"} lbs
                </p>
              </div>
            </div>

            <div className="team-pill-row">
              {metricCards.map((card) => (
                <span key={card.label} className="stat-chip">
                  {card.label}: {card.value}
                </span>
              ))}
            </div>
          </section>

          <div className="metric-grid">
            {metricCards.map((card) => (
              <MetricCard key={card.label} label={card.label} value={card.value} note={card.note} />
            ))}
          </div>

          <div className="two-column">
            <PagePanel eyebrow="Trendline" title="Last 10 games" description={isPitcher ? "Strikeouts, hits allowed, and earned runs by appearance." : "Hits, total bases, and RBI by game."}>
              {trendData.length > 0 ? (
                renderChart(
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Legend />
                      {isPitcher ? (
                        <>
                          <Line type="monotone" dataKey="strikeOuts" stroke="#2DA8FF" strokeWidth={3} dot={{ r: 4 }} />
                          <Line type="monotone" dataKey="earnedRuns" stroke="#FF8A00" strokeWidth={3} dot={{ r: 4 }} />
                          <Line type="monotone" dataKey="hits" stroke="#18C37E" strokeWidth={3} dot={{ r: 4 }} />
                        </>
                      ) : (
                        <>
                          <Line type="monotone" dataKey="hits" stroke="#2DA8FF" strokeWidth={3} dot={{ r: 4 }} />
                          <Line type="monotone" dataKey="totalBases" stroke="#FF8A00" strokeWidth={3} dot={{ r: 4 }} />
                          <Line type="monotone" dataKey="rbi" stroke="#18C37E" strokeWidth={3} dot={{ r: 4 }} />
                        </>
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                )
              ) : (
                <EmptyState>No recent game log returned for this player.</EmptyState>
              )}
            </PagePanel>

            <PagePanel eyebrow="Split toggles" title="Batting and location splits" description="Research windows that can be compared directly against the current matchup.">
              <div className="split-grid">
                <SplitInsightCard label="Vs Left" split={splitRows.vl} />
                <SplitInsightCard label="Vs Right" split={splitRows.vr} />
                <SplitInsightCard label="Home" split={splitRows.gh} />
                <SplitInsightCard label="Away" split={splitRows.ga} />
              </div>
            </PagePanel>
          </div>

          <div className="detail-grid">
            <WindowSummaryCard label="Last 3" summary={playerResearch.data.recent?.last3} isPitcher={isPitcher} />
            <WindowSummaryCard label="Last 5" summary={playerResearch.data.recent?.last5} isPitcher={isPitcher} />
            <WindowSummaryCard label="Last 10" summary={playerResearch.data.recent?.last10} isPitcher={isPitcher} />
          </div>

          <PagePanel
            eyebrow="Game log"
            title="Last 10 appearances table"
            description="A dense research ledger for recent form, venue context, and stat-line recall."
            action={<SourceBadge route={getRouteAudit(data.dataHealth, "/research/mlb/player/:playerId")} />}
          >
            {recentRows.length > 0 ? (
              <div className="table-shell table-shell--dense">
                <div className="table-row table-row--header table-row--recent">
                  <span>Date</span>
                  <span>Opponent</span>
                  <span>Venue</span>
                  <span>Line</span>
                </div>
                {recentRows.map((row) => (
                  <div key={row.key} className="table-row table-row--recent">
                    <span>{row.date}</span>
                    <span>{row.opponent}</span>
                    <span>{row.venue}</span>
                    <strong>{row.summary}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>No recent appearances were returned for this player.</EmptyState>
            )}
          </PagePanel>

          <div className="two-column">
            <PagePanel eyebrow="Head-to-head" title="Opponent history" description="Recent meetings against the currently selected opponent team.">
              {playerResearch.data.opponentHistory?.summary ? (
                <div className="stack-block">
                  <div className="detail-card">
                    <span className="detail-label">Opponent summary</span>
                    <strong className="detail-card-value">{playerResearch.data.opponentHistory.games.length} games</strong>
                    <p>
                      {isPitcher
                        ? `${playerResearch.data.opponentHistory.summary.inningsPitched} IP • ${playerResearch.data.opponentHistory.summary.era ?? "--"} ERA`
                        : `${playerResearch.data.opponentHistory.summary.hits} H • OPS ${fmtRate(playerResearch.data.opponentHistory.summary.ops)}`}
                    </p>
                  </div>
                  <div className="table-shell">
                    {playerResearch.data.opponentHistory.games.slice(0, 10).map((game, index) => (
                      <div key={`${game.date}-${index}`} className="table-row">
                        <span>{game.date}</span>
                        <strong>{game.summary || "Stat line unavailable"}</strong>
                        <small>{game.isHome ? "Home" : "Away"}</small>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState>No recent game logs were returned against this opponent team.</EmptyState>
              )}
            </PagePanel>

            <PagePanel eyebrow="Pitcher interaction" title="Batter vs probable pitcher" description="Only shown when the selected player is a hitter and the matchup has an opposing probable starter.">
              {playerResearch.data.vsPitcher ? (
                <div className="stack-block">
                  <div className="player-summary">
                    <PlayerPortrait player={playerResearch.data.vsPitcher.pitcher} />
                    <div>
                      <strong>{playerResearch.data.vsPitcher.pitcher.fullName}</strong>
                      <small>Opposing probable pitcher</small>
                    </div>
                  </div>
                  <div className="split-stat-grid">
                    <div className="info-pair">
                      <span>AVG</span>
                      <strong>{playerResearch.data.vsPitcher.summary.avg || "--"}</strong>
                    </div>
                    <div className="info-pair">
                      <span>OPS</span>
                      <strong>{playerResearch.data.vsPitcher.summary.ops || "--"}</strong>
                    </div>
                    <div className="info-pair">
                      <span>HR</span>
                      <strong>{playerResearch.data.vsPitcher.summary.homeRuns || 0}</strong>
                    </div>
                    <div className="info-pair">
                      <span>RBI</span>
                      <strong>{playerResearch.data.vsPitcher.summary.rbi || 0}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState>No batter-vs-pitcher history was returned for this selection.</EmptyState>
              )}
            </PagePanel>
          </div>
        </>
      ) : (
        <EmptyState>Select a matchup, team, and player to open the research panel.</EmptyState>
      )}
    </div>
  );
}

export function MarketsPage({ data }) {
  const scheduleGames = data.schedule?.games || [];
  const oddsRows = buildScheduleOddsRows(scheduleGames);
  const oddsSummary = buildScheduleSummary(scheduleGames);
  const movementRows = buildLineMovementRows(scheduleGames);
  const marketRows = buildMarketRows(data.markets || []);
  const riskRecommendations = data.risk?.recommendations || [];
  const slips = data.autobet?.slips || [];
  const summary = buildMarketSummary(marketRows, riskRecommendations, slips);
  const bookExposure = slips.reduce((accumulator, slip) => {
    const current = accumulator[slip.book] || 0;
    return { ...accumulator, [slip.book]: current + Number(slip.stake || 0) };
  }, {});
  const exposureData = Object.entries(bookExposure).map(([name, value]) => ({ name, value }));
  const scheduleRoute = getRouteAudit(data.dataHealth, "/schedule/mlb");
  const gameOddsRoute = getRouteAudit(data.dataHealth, "/games/mlb/:gameId/odds");
  const marketRoute = getRouteAudit(data.dataHealth, "/market/mlb");
  const riskRoute = getRouteAudit(data.dataHealth, "/risk/mlb");
  const autobetRoute = getRouteAudit(data.dataHealth, "/autobet/mlb");

  return (
    <div className="page-shell">
      <div className="metric-grid">
        <MetricCard
          label="Priced games"
          value={String(oddsSummary.pricedGames)}
          note={oddsSummary.pricedGames > 0 ? "Live scoreboard odds online" : "Waiting for book pricing"}
        />
        <MetricCard label="In-play prices" value={String(oddsSummary.inPlay)} note="Games actively repricing" />
        <MetricCard
          label="Largest favorite"
          value={oddsSummary.largestFavorite ? `${oddsSummary.largestFavorite.favorite} ${fmtOptionalMoneyline(oddsSummary.largestFavorite.favoriteMoneyline)}` : "--"}
          note={oddsSummary.largestFavorite ? oddsSummary.largestFavorite.matchup : "No favorite surfaced"}
        />
        <MetricCard
          label="Highest total"
          value={oddsSummary.highestTotal ? fmtLine(oddsSummary.highestTotal.totalLine) : "--"}
          note={oddsSummary.highestTotal ? oddsSummary.highestTotal.matchup : "No totals posted"}
        />
      </div>

      <PagePanel
        eyebrow="Game odds"
        title="Live MLB price board"
        description="Moneyline, runline, and total now flow from the ESPN scoreboard header feed, giving the markets page a real game-odds backbone before player-prop markets are fully D1-backed."
        action={<SourceBadge route={scheduleRoute} />}
      >
        {oddsRows.length > 0 ? (
          <div className="table-shell table-shell--dense">
            <div className="table-row table-row--header table-row--game-odds">
              <span>Matchup</span>
              <span>Status</span>
              <span>Moneyline</span>
              <span>Total</span>
              <span>Runline</span>
              <span>Book</span>
            </div>
            {oddsRows.map((row) => (
              <div key={row.gameId} className="table-row table-row--game-odds">
                <strong>{row.matchup}</strong>
                <span className={`status-flag status-flag--${String(row.status || "unknown").toLowerCase()}`}>{row.summary}</span>
                <span>{row.moneyline}</span>
                <span>{row.total}</span>
                <span>{row.runline}</span>
                <span>{row.provider}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>No live game odds are available yet for this slate.</EmptyState>
        )}
      </PagePanel>

      <div className="two-column">
        <PagePanel
          eyebrow="Movement"
          title="Open-to-latest line movement"
          description="This ledger highlights how home moneyline, total, and runline have moved from open to the latest available price."
          action={<SourceBadge route={gameOddsRoute} />}
        >
          {movementRows.length > 0 ? (
            <div className="table-shell table-shell--dense">
              <div className="table-row table-row--header table-row--movement">
                <span>Matchup</span>
                <span>Moneyline</span>
                <span>Total</span>
                <span>Runline</span>
                <span>Status</span>
              </div>
              {movementRows.slice(0, 8).map((row) => (
                <div key={row.gameId} className="table-row table-row--movement">
                  <strong>{row.matchup}</strong>
                  <span>{row.moneyline}</span>
                  <span>{row.total}</span>
                  <span>{row.runline}</span>
                  <span>{String(row.status || "UNKNOWN").replace(/_/g, " ")}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>No open-to-latest movement is available yet.</EmptyState>
          )}
        </PagePanel>

        <PagePanel eyebrow="Execution posture" title="Prop engine snapshot" description="The player-prop engine remains visible here while we continue shifting more of the research stack from seeded outputs to fully persisted D1 views.">
          <div className="detail-grid">
            <div className="detail-card">
              <span className="detail-label">Top edge</span>
              <strong className="detail-card-value">{summary.topEdge ? fmtSignedPercent(summary.topEdge.edge) : "--"}</strong>
              <p>{summary.topEdge ? `${summary.topEdge.player_name} ${summary.topEdge.prop_type}` : "No edge surfaced"}</p>
            </div>
            <div className="detail-card">
              <span className="detail-label">Average edge</span>
              <strong className="detail-card-value">{fmtSignedPercent(summary.averageEdge)}</strong>
              <p>{marketRows.length} active market rows</p>
            </div>
            <div className="detail-card">
              <span className="detail-label">Recommended stake</span>
              <strong className="detail-card-value">${Math.round(summary.totalStake)}</strong>
              <p>{riskRecommendations.length} bankroll decisions</p>
            </div>
            <div className="detail-card">
              <span className="detail-label">Auto exposure</span>
              <strong className="detail-card-value">${Math.round(summary.totalExposure)}</strong>
              <p>{slips.length} execution-ready slips</p>
            </div>
          </div>
        </PagePanel>
      </div>

      <PagePanel
        eyebrow="Market board"
        title="Full-width pricing and edge table"
        description="Serious market research starts with posted price, model fair, edge, confidence, book, and execution status in one grid."
        action={<SourceBadge route={marketRoute} />}
      >
        <div className="table-shell table-shell--dense">
          <div className="table-row table-row--header table-row--market">
            <span>Prop</span>
            <span>Player</span>
            <span>Team</span>
            <span>Posted</span>
            <span>Fair</span>
            <span>Edge</span>
            <span>Confidence</span>
            <span>Book</span>
            <span>Status</span>
          </div>
          {marketRows.map((market) => (
            <div key={`${market.player_id}-${market.prop_type}`} className="table-row table-row--market">
              <strong>{market.prop_type}</strong>
              <span>{market.player_name}</span>
              <span>{market.team}</span>
              <span>{fmtMoneyline(market.posted_american)}</span>
              <span>{fmtMoneyline(market.fair_american)}</span>
              <span className="positive-text">{fmtSignedPercent(market.edge)}</span>
              <span>{Math.round(Number(market.confidence || 0))}</span>
              <span>{market.best_book}</span>
              <span className={`status-flag status-flag--${market.status.toLowerCase()}`}>{market.status}</span>
            </div>
          ))}
        </div>
      </PagePanel>

      <div className="two-column">
        <PagePanel eyebrow="Edge ladder" title="Top-five edge stack" description="The best current positions ranked by signal strength and confidence.">
          {marketRows.length > 0 ? (
            renderChart(
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={marketRows.slice(0, 5).map((market) => ({ label: market.player_name.split(" ").slice(-1)[0], edge: Number(market.edge || 0) * 100, confidence: Number(market.confidence || 0) }))} layout="vertical">
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={96} />
                  <Tooltip />
                  <Bar dataKey="edge" radius={[0, 10, 10, 0]}>
                    {marketRows.slice(0, 5).map((market, index) => (
                      <Cell key={`${market.player_id}-${market.prop_type}`} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          ) : (
            <EmptyState>No positive-edge markets are available yet.</EmptyState>
          )}
        </PagePanel>

        <PagePanel eyebrow="Execution mix" title="Book exposure distribution" description="Autobet stake allocation by book from the current slip set.">
          {exposureData.length > 0 ? (
            renderChart(
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip />
                  <Legend />
                  <Pie data={exposureData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={2}>
                    {exposureData.map((entry, index) => (
                      <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )
          ) : (
            <EmptyState>No autobet exposure is available yet.</EmptyState>
          )}
        </PagePanel>
      </div>

      <div className="two-column">
        <PagePanel
          eyebrow="Risk engine"
          title="Stake sizing ledger"
          description="From model fair to capped stake, the bankroll engine now reads real market rows instead of seeded slip suggestions."
          action={<SourceBadge route={riskRoute} />}
        >
          <div className="table-shell table-shell--dense">
            <div className="table-row table-row--header table-row--risk">
              <span>Player</span>
              <span>Prop</span>
              <span>Edge</span>
              <span>Kelly</span>
              <span>Recommended</span>
              <span>Capped</span>
            </div>
            {riskRecommendations.map((bet) => (
              <div key={`${bet.player_id}-${bet.prop_type}`} className="table-row table-row--risk">
                <strong>{bet.player_name}</strong>
                <span>{bet.prop_type}</span>
                <span className="positive-text">{fmtSignedPercent(bet.edge)}</span>
                <span>{fmtPercent(bet.kelly_fraction)}</span>
                <span>${Math.round(bet.recommended_stake)}</span>
                <span>${Math.round(bet.capped_stake)}</span>
              </div>
            ))}
          </div>
        </PagePanel>

        <PagePanel eyebrow="Autobet" title="Execution-ready slip table" description="Top slips with book, odds, stake, confidence, and edge presented as a deployable execution queue." action={<SourceBadge route={autobetRoute} />}>
          <div className="table-shell table-shell--dense">
            <div className="table-row table-row--header table-row--autobet">
              <span>Book</span>
              <span>Player</span>
              <span>Prop</span>
              <span>Odds</span>
              <span>Stake</span>
              <span>Confidence</span>
              <span>Edge</span>
            </div>
            {slips.map((slip, index) => (
              <div key={`${slip.player_name}-${slip.prop_type}-${index}`} className="table-row table-row--autobet">
                <strong>{slip.book}</strong>
                <span>{slip.player_name}</span>
                <span>{slip.prop_type}</span>
                <span>{fmtMoneyline(slip.odds)}</span>
                <span>${Math.round(slip.stake)}</span>
                <span>{Math.round(Number(slip.confidence || 0))}</span>
                <span className="positive-text">{fmtSignedPercent(slip.edge)}</span>
              </div>
            ))}
          </div>
        </PagePanel>
      </div>
    </div>
  );
}

export function LivePage({ data, selectedDate }) {
  const liveSnapshot = data.live?.snapshot || data.live || null;
  const liveGameId = data.live?.game_id || liveSnapshot?.game_id;
  const liveContext = (data.contexts || []).find((context) => context.game_id === liveGameId) || firstOrNull(data.contexts || []);
  const pitchTimeline = buildPitchTimeline(data.live);
  const pitchMix = data.live?.pitch_type_mix || [];
  const recentEvents = (data.live?.recent_events || []).slice(0, 10);

  return (
    <div className="page-shell">
      <section className="research-hero">
        <div>
          <span className="section-eyebrow">Live game center</span>
          <h2>{liveContext ? `${liveContext.away_team} at ${liveContext.home_team}` : "Live board syncing"}</h2>
          <p>Real-time score state, pitch mix, recent event flow, and game environment for the currently tracked live matchup.</p>
        </div>
      </section>

      {liveSnapshot ? (
        <>
          <div className="metric-grid">
            <MetricCard label="Inning" value={`${liveSnapshot.inning_half} ${liveSnapshot.inning}`} note={`Slate date ${selectedDate}`} />
            <MetricCard label="Score" value={`${liveSnapshot.away_score}-${liveSnapshot.home_score}`} note={liveContext ? `${liveContext.away_team} at ${liveContext.home_team}` : "Tracked game"} />
            <MetricCard label="Count" value={`${liveSnapshot.balls}-${liveSnapshot.strikes}`} note={`${liveSnapshot.outs} outs`} />
            <MetricCard label="Win prob" value={fmtPercent(liveSnapshot.win_probability_home)} note="Home side live snapshot" />
          </div>

          <div className="two-column">
            <PagePanel eyebrow="Pitch rhythm" title="Recent pitch-speed timeline" description="Most recent pitches in order, using the event feed when live rows are available." action={<SourceBadge route={getRouteAudit(data.dataHealth, "/live/mlb")} />}>
              {pitchTimeline.length > 0 ? (
                renderChart(
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={pitchTimeline}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="speed" stroke="#2DA8FF" strokeWidth={3} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )
              ) : (
                <EmptyState>No pitch-event history is available yet for this game.</EmptyState>
              )}
            </PagePanel>

            <PagePanel eyebrow="Pitch mix" title="Pitch-type usage snapshot" description="Count and average velocity from the recent live event sample.">
              {pitchMix.length > 0 ? (
                renderChart(
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pitchMix}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis dataKey="pitch_type" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#FF8A00" radius={[10, 10, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )
              ) : (
                <EmptyState>Pitch-type mix will populate once recent D1 live rows exist.</EmptyState>
              )}
            </PagePanel>
          </div>

          <PagePanel eyebrow="Event feed" title="Last 10 live events" description="Recent count state, pitch call, and score context for the tracked game.">
            {recentEvents.length > 0 ? (
              <div className="table-shell table-shell--dense">
                <div className="table-row table-row--header table-row--live">
                  <span>Time</span>
                  <span>Inning</span>
                  <span>Count</span>
                  <span>Pitch</span>
                  <span>Speed</span>
                  <span>Call</span>
                  <span>Score</span>
                </div>
                {recentEvents.map((event, index) => (
                  <div key={`${event.timestamp || "event"}-${index}`} className="table-row table-row--live">
                    <span>{event.timestamp ? new Date(event.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "--"}</span>
                    <span>
                      {event.inning_half} {event.inning}
                    </span>
                    <span>
                      {event.balls}-{event.strikes}, {event.outs} out
                    </span>
                    <span>{event.pitch_type || "Unknown"}</span>
                    <span>{event.pitch_speed ? `${Math.round(event.pitch_speed)} mph` : "--"}</span>
                    <span>{event.call || "No call"}</span>
                    <strong>
                      {event.away_score}-{event.home_score}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>Live event rows have not been written for this matchup yet.</EmptyState>
            )}
          </PagePanel>
        </>
      ) : (
        <EmptyState>No live snapshot is currently available for the selected slate.</EmptyState>
      )}
    </div>
  );
}

export function LineupsPage({ data }) {
  const groupedLineups = (data.lineups?.lineups || []).reduce((accumulator, row) => {
    const key = row.team;
    const existing = accumulator[key] || [];
    return { ...accumulator, [key]: [...existing, row] };
  }, {});
  const injuries = data.lineups?.injuries || [];

  return (
    <div className="page-shell">
      <PagePanel eyebrow="Lineup intelligence" title="Batting Order Rooms" description="Confirmed orders, injury watch, and team-level presentation for the public slate.">
        <div className="lineup-grid">
          {Object.entries(groupedLineups).map(([team, rows]) => (
            <article key={team} className="lineup-card">
              <div className="lineup-header">
                <TeamMark team={team} />
              </div>
              <div className="list-stack">
                {rows
                  .slice()
                  .sort((a, b) => Number(a.batting_order || 0) - Number(b.batting_order || 0))
                  .map((row) => (
                    <div key={`${row.team}-${row.player_id}`} className="lineup-row">
                      <div className="lineup-row-meta">
                        <span className="lineup-order">{row.batting_order}</span>
                        <div>
                          <strong>{row.player_name}</strong>
                          <small className="lineup-subcopy">Game {row.game_id}</small>
                        </div>
                      </div>
                      <div className="lineup-status">{row.status || "Projected"}</div>
                    </div>
                  ))}
              </div>
            </article>
          ))}
        </div>
      </PagePanel>

      <div className="two-column">
        <PagePanel eyebrow="Health watch" title="Injury Monitor" description="Current caution flags and lineup risk notes.">
          {injuries.length > 0 ? (
            <div className="list-stack">
              {injuries.map((injury) => (
                <article key={`${injury.player_id}-${injury.status}`} className="injury-card">
                  <div className="injury-row">
                    <div>
                      <strong>{injury.player_name}</strong>
                      <small className="muted-copy">{injury.team}</small>
                    </div>
                    <div className="spot-text">{injury.status}</div>
                  </div>
                  <p>{injury.description}</p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState>No injury flags are currently returned.</EmptyState>
          )}
        </PagePanel>

        <PagePanel eyebrow="Readiness" title="Slate Context Snapshot" description="Quick game-level context next to the lineup stack so the page feels operational, not bare.">
          <div className="list-stack">
            {(data.contexts || []).map((context) => (
              <div key={context.game_id} className="detail-card">
                <span className="detail-label">
                  {context.away_team} at {context.home_team}
                </span>
                <strong>{context.park_name}</strong>
                <p>
                  {context.weather_desc} | Run env {fmtDecimal(context.run_environment)} | Confidence {fmtDecimal(context.confidence)}%
                </p>
              </div>
            ))}
          </div>
        </PagePanel>
      </div>
    </div>
  );
}
