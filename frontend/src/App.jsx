import { Suspense, lazy, startTransition, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import { todayIso } from "./api";
import { useSlateBundle } from "./dashboardData";

const LandingPage = lazy(() => import("./pages").then((module) => ({ default: module.LandingPage })));
const CommandCenterPage = lazy(() => import("./pages").then((module) => ({ default: module.CommandCenterPage })));
const TeamsPage = lazy(() => import("./pages").then((module) => ({ default: module.TeamsPage })));
const GamesPage = lazy(() => import("./pages").then((module) => ({ default: module.GamesPage })));
const PlayersPage = lazy(() => import("./pages").then((module) => ({ default: module.PlayersPage })));
const MarketsPage = lazy(() => import("./pages").then((module) => ({ default: module.MarketsPage })));
const LivePage = lazy(() => import("./pages").then((module) => ({ default: module.LivePage })));
const LineupsPage = lazy(() => import("./pages").then((module) => ({ default: module.LineupsPage })));

const navItems = [
  { to: "/", label: "Landing", end: true },
  { to: "/command-center", label: "Command Center" },
  { to: "/teams", label: "Teams" },
  { to: "/games", label: "Matchups" },
  { to: "/players", label: "Players" },
  { to: "/markets", label: "Markets" },
  { to: "/live", label: "Live" },
  { to: "/lineups", label: "Lineups" }
];

function SiteHeader({ selectedDate, setSelectedDate, health }) {
  return (
    <header className="site-header">
      <div className="site-header-row">
        <div className="brand-unit">
          <img className="brand-unit-logo" src="/brand/growth-connectivity-icon.png" alt="SportsSense AI icon" />
          <div className="brand-unit-copy">
            <span className="brand-kicker">SportsSense AI</span>
            <strong>Real-time MLB intelligence platform</strong>
            <p>AI, analytics, matchup research, and edge discovery in one premium MLB decision platform.</p>
          </div>
        </div>

        <div className="site-tools">
          <label className="field-inline">
            <span>Slate Date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                const nextDate = event.target.value;
                startTransition(() => setSelectedDate(nextDate));
              }}
            />
          </label>

          <div className={`status-pill ${health?.ok ? "is-live" : "is-warn"}`}>
            <span className="status-dot" />
            {health?.ok ? "Platform live" : "Data syncing"}
          </div>
        </div>
      </div>

      <div className="site-nav-row">
        <nav className="site-nav" aria-label="Primary">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="site-footprint">
          <span>Live slate intelligence</span>
          <span>Matchup research</span>
          <span>Market signals</span>
          <span>AI analysis</span>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const data = useSlateBundle(selectedDate);

  return (
    <div className="site-shell">
      <SiteHeader selectedDate={selectedDate} setSelectedDate={setSelectedDate} health={data.health} />

      <main className="site-main">
        {data.error ? <div className="warning-banner">Data refresh warning: {data.error}</div> : null}

        <Suspense fallback={<div className="empty-state">Loading SportsSense AI experience...</div>}>
          <Routes>
            <Route path="/" element={<LandingPage data={data} selectedDate={selectedDate} />} />
            <Route path="/command-center" element={<CommandCenterPage data={data} selectedDate={selectedDate} />} />
            <Route path="/teams" element={<TeamsPage selectedDate={selectedDate} />} />
            <Route path="/games" element={<GamesPage data={data} selectedDate={selectedDate} />} />
            <Route path="/players" element={<PlayersPage data={data} selectedDate={selectedDate} />} />
            <Route path="/markets" element={<MarketsPage data={data} />} />
            <Route path="/live" element={<LivePage data={data} selectedDate={selectedDate} />} />
            <Route path="/lineups" element={<LineupsPage data={data} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <footer className="site-footer">
        <div className="site-footer-brand">
          <img src="/brand/sportssense-circuit-logo.png" alt="SportsSense AI circuit logo" />
          <div>
            <strong>SportsSense AI</strong>
            <span>We don't just show data. We help you understand it and act on it.</span>
          </div>
        </div>
        <span>Live MLB research, modeling, and decision support running now.</span>
      </footer>
    </div>
  );
}
