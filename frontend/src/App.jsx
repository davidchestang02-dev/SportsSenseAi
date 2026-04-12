import { Suspense, lazy, startTransition, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import { todayIso } from "./api";
import { useSlateBundle } from "./dashboardData";

const LandingPage = lazy(() => import("./pages").then((module) => ({ default: module.LandingPage })));
const CommandCenterPage = lazy(() => import("./pages").then((module) => ({ default: module.CommandCenterPage })));
const TeamsPage = lazy(() => import("./pages").then((module) => ({ default: module.TeamsPage })));
const GamesPage = lazy(() => import("./pages").then((module) => ({ default: module.GamesPage })));
const PlayersPage = lazy(() => import("./pages").then((module) => ({ default: module.PlayersPage })));
const PitchersPage = lazy(() => import("./pages").then((module) => ({ default: module.PitchersPage })));
const WeatherPage = lazy(() => import("./pages").then((module) => ({ default: module.WeatherPage })));
const MarketsPage = lazy(() => import("./pages").then((module) => ({ default: module.MarketsPage })));
const LivePage = lazy(() => import("./pages").then((module) => ({ default: module.LivePage })));
const LineupsPage = lazy(() => import("./pages").then((module) => ({ default: module.LineupsPage })));

const navItems = [
  { to: "/", label: "Home", end: true },
  { to: "/command-center", label: "Command" },
  { to: "/teams", label: "Teams" },
  { to: "/games", label: "Games" },
  { to: "/players", label: "Players" },
  { to: "/pitchers", label: "Pitchers" },
  { to: "/weather", label: "Weather" },
  { to: "/markets", label: "Markets" },
  { to: "/live", label: "Live Ops" },
  { to: "/lineups", label: "Lineups" }
];

function SiteHeader({ selectedDate, setSelectedDate, health }) {
  return (
    <header className="site-header">
      <div className="site-header-row">
        <div className="brand-unit">
          <img className="brand-unit-logo" src="/favicon.svg" alt="SportsSense AI mark" />
          <div className="brand-unit-copy">
            <span className="brand-kicker">SportsSense AI</span>
            <strong>MLB operations console</strong>
            <p>Deterministic modeling, stats layers, live pricing, and matchup research in one accessible command surface.</p>
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
          <span>Deterministic layer</span>
          <span>Stats layer</span>
          <span>Live market ops</span>
          <span>Research rooms</span>
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
            <Route path="/pitchers" element={<PitchersPage selectedDate={selectedDate} />} />
            <Route path="/weather" element={<WeatherPage selectedDate={selectedDate} />} />
            <Route path="/markets" element={<MarketsPage data={data} />} />
            <Route path="/live" element={<LivePage data={data} selectedDate={selectedDate} />} />
            <Route path="/lineups" element={<LineupsPage data={data} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <footer className="site-footer">
        <div className="site-footer-brand">
          <img src="/favicon.svg" alt="SportsSense AI mark" />
          <div>
            <strong>SportsSense AI</strong>
            <span>Accessible MLB research, pricing oversight, and live-sync operations.</span>
          </div>
        </div>
        <span>Built to preserve the modeling stack while improving the daily operating surface.</span>
      </footer>
    </div>
  );
}
