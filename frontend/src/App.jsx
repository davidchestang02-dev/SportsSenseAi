import { Suspense, lazy, startTransition, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import { todayIso } from "./api";
import { useSlateBundle } from "./dashboardData";
import { TeamMark } from "./ui";

const LandingPage = lazy(() => import("./pages").then((module) => ({ default: module.LandingPage })));
const CommandCenterPage = lazy(() => import("./pages").then((module) => ({ default: module.CommandCenterPage })));
const PlayersPage = lazy(() => import("./pages").then((module) => ({ default: module.PlayersPage })));
const GamesPage = lazy(() => import("./pages").then((module) => ({ default: module.GamesPage })));
const MarketsPage = lazy(() => import("./pages").then((module) => ({ default: module.MarketsPage })));
const LineupsPage = lazy(() => import("./pages").then((module) => ({ default: module.LineupsPage })));

const navItems = [
  { to: "/", label: "Landing", end: true },
  { to: "/command-center", label: "Command Center" },
  { to: "/players", label: "Players" },
  { to: "/games", label: "Games" },
  { to: "/markets", label: "Markets" },
  { to: "/lineups", label: "Lineups" }
];

function ShellNav() {
  return (
    <aside className="app-nav">
      <div className="brand-lockup">
        <span className="brand-kicker">SportsSenseAi</span>
        <strong>MLB Intelligence Platform</strong>
        <p>Cloudflare-native slate simulation, player intelligence, edge pricing, and bankroll execution.</p>
      </div>

      <nav className="nav-stack" aria-label="Primary">
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

      <div className="nav-card">
        <span className="mini-label">Platform Footprint</span>
        <div className="nav-card-list">
          <span>Pages frontend</span>
          <span>Workers API</span>
          <span>D1 + R2</span>
          <span>AI Gateway</span>
        </div>
      </div>
    </aside>
  );
}

function ShellTopbar({ selectedDate, setSelectedDate, health }) {
  return (
    <header className="topbar">
      <div>
        <span className="page-kicker">SportsSenseAi MLB</span>
        <h1>Professional betting intelligence, not a one-screen mockup.</h1>
      </div>

      <div className="topbar-tools">
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
          {health?.ok ? "Live on Cloudflare" : "Syncing runtime"}
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const data = useSlateBundle(selectedDate);

  return (
    <div className="app-shell">
      <ShellNav />

      <div className="app-stage">
        <ShellTopbar selectedDate={selectedDate} setSelectedDate={setSelectedDate} health={data.health} />
        {data.error ? <div className="warning-banner">Data refresh warning: {data.error}</div> : null}

        <Suspense fallback={<div className="empty-state">Loading page experience...</div>}>
          <Routes>
            <Route path="/" element={<LandingPage data={data} selectedDate={selectedDate} />} />
            <Route path="/command-center" element={<CommandCenterPage data={data} selectedDate={selectedDate} />} />
            <Route path="/players" element={<PlayersPage data={data} />} />
            <Route path="/games" element={<GamesPage data={data} />} />
            <Route path="/markets" element={<MarketsPage data={data} />} />
            <Route path="/lineups" element={<LineupsPage data={data} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>

        <footer className="app-footer">
          <div className="footer-brand">
            <TeamMark team="SportsSenseAi" compact />
            <span>SportsSenseAi is now running as a routed Cloudflare Pages product surface.</span>
          </div>
          <span>Backend: Workers, D1, R2, AI Gateway</span>
        </footer>
      </div>
    </div>
  );
}
