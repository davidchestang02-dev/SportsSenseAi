import { useDeferredValue, useState } from "react";
import { Link } from "react-router-dom";
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
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { askAi } from "./api";
import { EmptyState, fmtDecimal, fmtMoneyline, fmtPercent, fmtSignedPercent, MetricCard, PagePanel, PlayerPortrait, TeamMark } from "./ui";

const chartColors = ["#6cd4c6", "#f7b85f", "#7eb7ff", "#ff9074", "#9b88ff"];

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
  const topBatter = firstOrNull(data.simulation?.slate?.top_batters || []);
  const topGame = firstOrNull(data.simulation?.games || []);
  const topEdge = firstOrNull(data.markets || []);

  return (
    <div className="page-shell">
      <section className="page-hero">
        <div className="page-hero-copy">
          <span className="section-eyebrow">Launch-ready surface</span>
          <h2>From landing page to model room to edge board.</h2>
          <p>
            SportsSenseAi now has a real product shape: a public landing experience, multi-page navigation, richer
            charts, lineup intelligence, player cards, matchup rooms, edge ranking, and a direct path into AI-assisted
            MLB decision-making.
          </p>
          <div className="cta-row">
            <Link className="primary-button" to="/command-center">
              Open Command Center
            </Link>
            <Link className="secondary-button" to="/markets">
              Review Edge Board
            </Link>
            <Link className="ghost-button" to="/lineups">
              Check Lineups
            </Link>
          </div>
        </div>

        <div className="hero-showcase">
          <div className="story-card">
            <span className="card-tag">Top batter signal</span>
            <strong>{topBatter ? `${topBatter.player_name} ${fmtPercent(topBatter.P_hrh_2p)}` : "Loading"}</strong>
            <p>Flagship player card with portrait treatment, prop ladder, and matchup context.</p>
          </div>
          <div className="story-card">
            <span className="card-tag">Featured matchup</span>
            <strong>{topGame ? `${topGame.matchup} total ${fmtDecimal(topGame.projected_total)}` : "Loading"}</strong>
            <p>Game rooms blend expected total, park context, weather, bullpen edge, and live scoreboard pulse.</p>
          </div>
          <div className="story-card">
            <span className="card-tag">Edge board</span>
            <strong>{topEdge ? `${topEdge.player_name} ${fmtSignedPercent(topEdge.edge)}` : "Loading"}</strong>
            <p>Pricing, stake sizing, and autobet flow are now surfaced in dedicated market pages instead of a single block.</p>
          </div>
        </div>
      </section>

      <div className="metric-grid">
        <MetricCard label="Live date" value={selectedDate} note="Current slate target" />
        <MetricCard label="Games tracked" value={String((data.simulation?.games || []).length)} note="On the public slate board" />
        <MetricCard label="Markets surfaced" value={String((data.markets || []).length)} note="Positive-edge prop opportunities" />
        <MetricCard label="AI status" value={data.health?.ok ? "Online" : "Syncing"} note="Cloudflare AI Gateway path" />
      </div>

      <div className="cards-grid">
        {(data.simulation?.slate?.top_batters || []).slice(0, 3).map((player) => (
          <PlayerSignalCard key={player.player_id} player={player} />
        ))}
      </div>
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
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="matchup" tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar yAxisId="left" dataKey="projected_total" fill="#6cd4c6" radius={[10, 10, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="run_environment" stroke="#f7b85f" strokeWidth={3} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </PagePanel>

        <PagePanel eyebrow="Model health" title="Calibration Track" description="Projected versus actual outcome rate across the HRH bucket curve.">
          {renderChart(
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={calibrationSeries}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="projected" stroke="#7eb7ff" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="actual" stroke="#6cd4c6" strokeWidth={3} dot={{ r: 4 }} />
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
                <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
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
            <p>The response is coming through the live Cloudflare AI Gateway route.</p>
          </div>
        </PagePanel>
      </div>
    </div>
  );
}

export function PlayersPage({ data }) {
  const players = (data.simulation?.players || []).filter((player) => player.type === "batter");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const filteredPlayers = players.filter((player) => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return `${player.player_name} ${player.team} ${player.opp_team}`.toLowerCase().includes(query);
  });
  const featuredPlayer = filteredPlayers[0] || players[0] || null;

  return (
    <div className="page-shell">
      <section className="page-hero">
        <div className="page-hero-copy">
          <span className="section-eyebrow">Player intelligence</span>
          <h2>Headshots, signal ladders, and matchup-level detail.</h2>
          <p>
            This page turns the player model into something browsable: searchable player cards, prop-profile charts,
            matchup context, and confidence-ranked batting signals for the active slate.
          </p>
        </div>
        <PlayerSignalCard player={featuredPlayer} />
      </section>

      <PagePanel eyebrow="Search" title="Player Board" description="Filter the current batter pool and inspect individual prop ladders.">
        <div className="filter-row">
          <label className="field-stack">
            <span className="mini-label">Search players</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Aaron Judge, Padres, Dodgers..." />
          </label>
        </div>

        <div className="two-column">
          <div className="detail-card">
            <span className="detail-label">Featured profile</span>
            <strong>{featuredPlayer ? featuredPlayer.player_name : "No player selected"}</strong>
            <p>
              {featuredPlayer
                ? `${featuredPlayer.team} vs ${featuredPlayer.opp_team} with a composite score of ${fmtDecimal(featuredPlayer.compositeScore)} and HRH 2+ probability of ${fmtPercent(featuredPlayer.P_hrh_2p)}.`
                : "No batter signal is available."}
            </p>
            <div className="team-pill-row">
              {featuredPlayer ? <TeamMark team={featuredPlayer.team} /> : null}
              {featuredPlayer ? <TeamMark team={featuredPlayer.opp_team} /> : null}
            </div>
          </div>

          <PagePanel eyebrow="Prop profile" title="Featured Player Line Graph" description="Probability curve across the current prop ladder.">
            {featuredPlayer ? (
              renderChart(
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={buildPlayerProfile(featuredPlayer)}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="#6cd4c6" strokeWidth={3} dot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              )
            ) : (
              <EmptyState>No player data is available for a profile chart.</EmptyState>
            )}
          </PagePanel>
        </div>
      </PagePanel>

      <div className="cards-grid">
        {filteredPlayers.slice(0, 9).map((player) => (
          <PlayerSignalCard key={player.player_id} player={player} />
        ))}
      </div>
    </div>
  );
}

export function GamesPage({ data }) {
  const gameOutlook = buildGameOutlook(data.simulation, data.contexts);

  return (
    <div className="page-shell">
      <PagePanel eyebrow="Matchup rooms" title="Game Outlook" description="Every matchup now has a proper room with team marks, total expectations, and environment context.">
        <div className="cards-grid">
          {(data.contexts || []).map((context) => {
            const simulationGame = (data.simulation?.games || []).find((game) => game.game_id === context.game_id);
            return (
              <article key={context.game_id} className="game-card">
                <div className="game-card-top">
                  <TeamMark team={context.away_team} />
                  <strong>at</strong>
                  <TeamMark team={context.home_team} />
                </div>
                <div className="detail-grid">
                  <div className="detail-card">
                    <span className="detail-label">Projected total</span>
                    <strong className="detail-card-value">{fmtDecimal(simulationGame?.projected_total)}</strong>
                    <p>Confidence {fmtDecimal(context.confidence)}%</p>
                  </div>
                  <div className="detail-card">
                    <span className="detail-label">Venue</span>
                    <strong className="detail-card-value">{context.park_name}</strong>
                    <p>Park factor {fmtDecimal(context.park_factor)}</p>
                  </div>
                  <div className="detail-card">
                    <span className="detail-label">Weather</span>
                    <strong className="detail-card-value">{context.weather_desc}</strong>
                    <p>Umpire {context.umpire_name}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </PagePanel>

      <div className="two-column">
        <PagePanel eyebrow="Environment" title="Totals vs Run Environment" description="Projected totals plotted against each game's environment score.">
          {renderChart(
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={gameOutlook}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="matchup" tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar yAxisId="left" dataKey="projected_total" fill="#7eb7ff" radius={[10, 10, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="run_environment" stroke="#f7b85f" strokeWidth={3} dot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </PagePanel>

        <PagePanel eyebrow="Live pulse" title="Current Featured Game" description="Quick live-state card from the Workers live endpoint.">
          {data.live ? (
            <div className="detail-grid">
              <div className="detail-card">
                <span className="detail-label">Game</span>
                <strong className="detail-card-value">{data.live.game_id}</strong>
                <p>
                  {data.live.inning_half} {data.live.inning}
                </p>
              </div>
              <div className="detail-card">
                <span className="detail-label">Score</span>
                <strong className="detail-card-value">
                  {data.live.away_score} - {data.live.home_score}
                </strong>
                <p>{data.live.outs} outs</p>
              </div>
              <div className="detail-card">
                <span className="detail-label">Home win %</span>
                <strong className="detail-card-value">{fmtPercent(data.live.win_probability_home)}</strong>
                <p>{data.live.last_update}</p>
              </div>
            </div>
          ) : (
            <EmptyState>Live state is not available right now.</EmptyState>
          )}
        </PagePanel>
      </div>
    </div>
  );
}

export function MarketsPage({ data }) {
  const topMarkets = (data.markets || []).slice(0, 10);
  const riskRecommendations = data.risk?.recommendations || [];
  const slips = data.autobet?.slips || [];
  const bookExposure = slips.reduce((accumulator, slip) => {
    const current = accumulator[slip.book] || 0;
    return { ...accumulator, [slip.book]: current + Number(slip.stake || 0) };
  }, {});
  const exposureData = Object.entries(bookExposure).map(([name, value]) => ({ name, value }));

  return (
    <div className="page-shell">
      <div className="two-column">
        <PagePanel eyebrow="Pricing room" title="Top Edge Board" description="A true market page with pricing, book comparison, and edge intensity instead of a single summary card.">
          <div className="list-stack">
            {topMarkets.map((market) => (
              <div key={`${market.player_id}-${market.prop_type}`} className="market-row">
                <div className="market-row-meta">
                  <TeamMark team={market.team} compact />
                  <div>
                    <strong>{market.player_name}</strong>
                    <small>
                      {market.prop_type} at {market.best_book}
                    </small>
                  </div>
                </div>
                <div className="market-odds">
                  Fair {fmtMoneyline(market.fair_american)} | Book {fmtMoneyline(market.posted_american)}
                </div>
                <div className="positive-text">{fmtSignedPercent(market.edge)}</div>
              </div>
            ))}
          </div>
        </PagePanel>

        <PagePanel eyebrow="Portfolio shape" title="Book Exposure Mix" description="Autobet exposure distribution based on current slip output.">
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
        <PagePanel eyebrow="Bankroll control" title="Risk Recommendations" description="Stake sizing from the risk engine, surfaced as a decision list instead of raw JSON.">
          <div className="list-stack">
            {riskRecommendations.map((bet) => (
              <div key={`${bet.player_id}-${bet.prop_type}`} className="slip-row">
                <div className="slip-meta">
                  <strong>{bet.player_name}</strong>
                  <small>{bet.prop_type}</small>
                </div>
                <div className="spot-text">{fmtSignedPercent(bet.edge)}</div>
                <div>${Math.round(bet.capped_stake)}</div>
              </div>
            ))}
          </div>
        </PagePanel>

        <PagePanel eyebrow="Automation" title="Autobet Slips" description="Execution-ready slips generated from the current top recommendation set.">
          <div className="slips-grid">
            {slips.map((slip, index) => (
              <article key={`${slip.player_name}-${slip.prop_type}-${index}`} className="slip-card">
                <span className="card-tag">{slip.book}</span>
                <strong>{slip.player_name}</strong>
                <p>{slip.prop_type}</p>
                <div className="detail-grid">
                  <div className="detail-card">
                    <span className="detail-label">Odds</span>
                    <strong className="detail-card-value">{fmtMoneyline(slip.odds)}</strong>
                  </div>
                  <div className="detail-card">
                    <span className="detail-label">Stake</span>
                    <strong className="detail-card-value">${Math.round(slip.stake)}</strong>
                  </div>
                  <div className="detail-card">
                    <span className="detail-label">Edge</span>
                    <strong className="detail-card-value">{fmtSignedPercent(slip.edge)}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </PagePanel>
      </div>
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
                <span className="detail-label">{context.away_team} at {context.home_team}</span>
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
