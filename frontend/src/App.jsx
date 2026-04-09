import { useEffect, useMemo, useState } from "react";

import { askAi, getHealth, getMarkets, getRisk, getSimulation, todayIso } from "./api";

const fallbackStatus = {
  ok: true,
  app: "SportsSenseAi",
  db_bound: true,
  latest_calibration: {
    date: todayIso(),
    prop_type: "hrh_2p",
    proj_avg: 0.3,
    actual_avg: 0.289,
    count: 48
  }
};

function fmtPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function fmtSigned(value) {
  const number = Number(value || 0);
  return `${number >= 0 ? "+" : ""}${number.toFixed(1)}%`;
}

function fmtMoneyline(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${Math.round(number)}`;
}

function useDashboardState(selectedDate) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    health: fallbackStatus,
    simulation: null,
    markets: [],
    risk: null
  });

  useEffect(() => {
    let active = true;

    async function load() {
      setState((current) => ({ ...current, loading: true, error: "" }));

      try {
        const [health, simulation, markets, risk] = await Promise.all([
          getHealth(),
          getSimulation(selectedDate),
          getMarkets(selectedDate),
          getRisk(selectedDate)
        ]);

        if (!active) return;

        setState({
          loading: false,
          error: "",
          health,
          simulation,
          markets,
          risk
        });
      } catch (error) {
        if (!active) return;

        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : "Unable to load live data."
        }));
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [selectedDate]);

  return state;
}

function StatCard({ label, value, note }) {
  return (
    <article className="stat-card">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-note">{note}</span>
    </article>
  );
}

function SectionCard({ title, eyebrow, children, action }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="panel-eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function App() {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [question, setQuestion] = useState("Who has the cleanest HRH 2+ edge on today's slate?");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiWarning, setAiWarning] = useState("");

  const { loading, error, health, simulation, markets, risk } = useDashboardState(selectedDate);

  const headlineStats = useMemo(() => {
    const topBatter = simulation?.slate?.top_batters?.[0];
    const topGame = simulation?.games?.[0];
    const topEdge = markets?.[0];
    const topRisk = risk?.recommendations?.[0];

    return {
      topBatter: topBatter ? `${topBatter.player_name} ${fmtPercent(topBatter.P_hrh_2p)}` : "Loading",
      topGame: topGame ? `${topGame.matchup} ${topGame.projected_total.toFixed(1)}` : "Loading",
      topEdge: topEdge ? `${topEdge.player_name} ${fmtSigned(topEdge.edge)}` : "Loading",
      topStake: topRisk ? `$${topRisk.capped_stake.toFixed(0)}` : "Loading"
    };
  }, [markets, risk, simulation]);

  async function handleAskAi() {
    setAiLoading(true);
    setAiWarning("");

    try {
      const result = await askAi(question, selectedDate);
      setAiAnswer(result.answer || "No answer returned.");
      setAiWarning(result.warning || "");
    } catch (error) {
      setAiAnswer("");
      setAiWarning(error instanceof Error ? error.message : "Unable to reach the AI route.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="shell">
      <div className="bg-orb bg-orb-a" />
      <div className="bg-orb bg-orb-b" />

      <header className="topbar">
        <div>
          <span className="brand-mark">SSA MLB</span>
          <h1>SportsSenseAi</h1>
        </div>
        <div className="topbar-actions">
          <span className={`badge ${health?.ok ? "badge-live" : "badge-warn"}`}>
            {health?.ok ? "Live on Cloudflare" : "Checking runtime"}
          </span>
          <a className="ghost-link" href="#copilot">
            Open AI Copilot
          </a>
        </div>
      </header>

      <main className="layout">
        <section className="hero">
          <div className="hero-copy">
            <span className="kicker">Cloudflare-native MLB intelligence</span>
            <h2>Launch a premium betting dashboard, not a spreadsheet with buttons.</h2>
            <p>
              SportsSenseAi turns slate simulation, edge detection, bankroll control, and AI-assisted explanations into
              one fast Cloudflare experience backed by Workers, D1, R2, and AI Gateway.
            </p>
            <div className="hero-controls">
              <label className="field">
                <span>Slate Date</span>
                <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
              </label>
              <button className="primary-button" type="button" onClick={() => setSelectedDate(todayIso())}>
                Jump to Today
              </button>
            </div>
            {error ? <p className="warning-banner">Live refresh warning: {error}</p> : null}
          </div>

          <div className="hero-matrix">
            <StatCard label="Top HRH Signal" value={headlineStats.topBatter} note="Highest batter probability on board" />
            <StatCard label="Featured Matchup" value={headlineStats.topGame} note="Projected game total" />
            <StatCard label="Largest Edge" value={headlineStats.topEdge} note="Best available market delta" />
            <StatCard label="Recommended Stake" value={headlineStats.topStake} note="Risk-engine cap suggestion" />
          </div>
        </section>

        <section className="dashboard-grid">
          <SectionCard
            title="Slate Outlook"
            eyebrow="Simulation"
            action={<span className="micro-pill">{loading ? "Refreshing" : "Live bundle"}</span>}
          >
            <div className="two-column">
              <div className="table-card">
                <h3>Projected Games</h3>
                <div className="list-stack">
                  {(simulation?.games || []).slice(0, 4).map((game) => (
                    <div key={game.game_id} className="row-card">
                      <div>
                        <strong>{game.matchup}</strong>
                        <span>Total {game.projected_total.toFixed(1)}</span>
                      </div>
                      <div className="row-metric">
                        <span>{game.run_environment.toFixed(2)} env</span>
                        <strong>{fmtPercent(game.confidence)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="table-card">
                <h3>Top Batter Board</h3>
                <div className="list-stack">
                  {(simulation?.slate?.top_batters || []).slice(0, 5).map((player) => (
                    <div key={player.player_id} className="row-card">
                      <div>
                        <strong>{player.player_name}</strong>
                        <span>
                          {player.team} vs {player.opp_team}
                        </span>
                      </div>
                      <div className="row-metric">
                        <span>HRH 2+</span>
                        <strong>{fmtPercent(player.P_hrh_2p)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Market Board" eyebrow="Edge detection">
            <div className="table-card">
              <div className="table-head">
                <span>Player</span>
                <span>Prop</span>
                <span>Fair</span>
                <span>Book</span>
                <span>Edge</span>
              </div>
              {(markets || []).slice(0, 8).map((market) => (
                <div key={`${market.player_id}-${market.prop_type}`} className="table-row">
                  <span>
                    <strong>{market.player_name}</strong>
                    <small>{market.team}</small>
                  </span>
                  <span>{market.prop_type}</span>
                  <span>{fmtMoneyline(market.fair_american)}</span>
                  <span>{fmtMoneyline(market.posted_american)}</span>
                  <span className="positive-text">{fmtSigned(market.edge)}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Risk Engine" eyebrow="Bankroll control">
            <div className="table-card">
              <div className="table-head">
                <span>Pick</span>
                <span>Edge</span>
                <span>Confidence</span>
                <span>Stake</span>
              </div>
              {(risk?.recommendations || []).slice(0, 6).map((bet) => (
                <div key={`${bet.player_id}-${bet.prop_type}`} className="table-row">
                  <span>
                    <strong>{bet.player_name}</strong>
                    <small>{bet.prop_type}</small>
                  </span>
                  <span className="positive-text">{fmtSigned(bet.edge)}</span>
                  <span>{fmtPercent(bet.confidence / 100)}</span>
                  <span>${bet.capped_stake.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="AI Copilot" eyebrow="Game explanation" action={<span className="micro-pill">Gateway live</span>}>
            <div id="copilot" className="copilot-panel">
              <label className="field field-full">
                <span>Ask the model</span>
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={5}
                  placeholder="Ask for the cleanest edge, strongest batter, or a quick slate summary."
                />
              </label>
              <div className="copilot-actions">
                <button className="primary-button" type="button" onClick={handleAskAi} disabled={aiLoading}>
                  {aiLoading ? "Thinking..." : "Run AI Analysis"}
                </button>
                {aiWarning ? <span className="warning-inline">{aiWarning}</span> : null}
              </div>
              <article className="answer-card">
                <h3>Response</h3>
                <p>{aiAnswer || "Ask a question to generate an explanation from the live AI route."}</p>
              </article>
            </div>
          </SectionCard>

          <SectionCard title="Platform Status" eyebrow="Cloudflare runtime">
            <div className="status-grid">
              <div className="status-block">
                <span className="status-label">App</span>
                <strong>{health?.app || "SportsSenseAi"}</strong>
                <small>{health?.worker || "router"}</small>
              </div>
              <div className="status-block">
                <span className="status-label">Database</span>
                <strong>{health?.db_bound ? "D1 connected" : "Binding missing"}</strong>
                <small>{health?.latest_calibration?.count || 0} calibration rows</small>
              </div>
              <div className="status-block">
                <span className="status-label">Calibration</span>
                <strong>{health?.latest_calibration?.prop_type || "hrh_2p"}</strong>
                <small>
                  Proj {health?.latest_calibration?.proj_avg ?? "--"} vs actual{" "}
                  {health?.latest_calibration?.actual_avg ?? "--"}
                </small>
              </div>
            </div>
          </SectionCard>
        </section>
      </main>
    </div>
  );
}
