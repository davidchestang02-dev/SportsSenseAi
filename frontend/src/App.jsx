import { Suspense, lazy, startTransition, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { todayIso } from "./api";
import { useSlateBundle } from "./dashboardData";

const LandingPage = lazy(() => import("./pages").then((module) => ({ default: module.LandingPage })));
const CommandCenterPage = lazy(() => import("./pages").then((module) => ({ default: module.CommandCenterPage })));
const TeamsPage = lazy(() => import("./pages").then((module) => ({ default: module.TeamsPage })));
const GamesPage = lazy(() => import("./pages").then((module) => ({ default: module.GamesPage })));
const PlayersPage = lazy(() => import("./pages").then((module) => ({ default: module.PlayersPage })));
const PitchersPage = lazy(() => import("./pages").then((module) => ({ default: module.PitchersPage })));
const WeatherPage = lazy(() => import("./pages").then((module) => ({ default: module.WeatherPage })));
const MLBPropsPage = lazy(() => import("./features/mlb-props/MLBPropsPage"));
const LivePage = lazy(() => import("./pages").then((module) => ({ default: module.LivePage })));
const LineupsPage = lazy(() => import("./pages").then((module) => ({ default: module.LineupsPage })));

const navItems = [
  { to: "/", label: "Home", end: true },
  { to: "/command-center", label: "Board" },
  { to: "/games", label: "Matchups" },
  { to: "/mlb", label: "Props" },
  { to: "/live", label: "Live" },
  { to: "/teams", label: "Teams" },
  { to: "/players", label: "Players" },
  { to: "/pitchers", label: "Pitchers" },
  { to: "/weather", label: "Weather" },
  { to: "/lineups", label: "Lineups" }
];

function SiteHeader({ selectedDate, setSelectedDate, health }) {
  return (
    <header className="site-header">
      <div className="site-header-row">
        <div className="brand-unit">
          <img className="brand-unit-logo" src="/brand/growth-connectivity-icon.png" alt="SportsSense AI mark" />
          <div className="brand-unit-copy">
            <span className="brand-kicker">SportsSenseAi MLB</span>
            <strong>Premium intelligence platform for props, live markets, and matchup research</strong>
            <p>Deterministic modeling, stats layers, live pricing, pregame context, and execution surfaces aligned in one branded operating system.</p>
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
          <span>Statcast previews</span>
          <span>Live market ops</span>
          <span>Pitcher labs</span>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const data = useSlateBundle(selectedDate);
  const location = useLocation();
  const isPropsExperience = location.pathname === "/mlb" || location.pathname === "/markets";

  return (
    <div className={`site-shell${isPropsExperience ? " site-shell--immersive" : ""}`}>
      {!isPropsExperience ? (
        <SiteHeader selectedDate={selectedDate} setSelectedDate={setSelectedDate} health={data.health} />
      ) : null}

      <main className={`site-main${isPropsExperience ? " site-main--immersive" : ""}`}>
        {!isPropsExperience && data.error ? <div className="warning-banner">Data refresh warning: {data.error}</div> : null}

        <Suspense fallback={<div className="empty-state">Loading SportsSense AI experience...</div>}>
          <Routes>
            <Route path="/" element={<LandingPage data={data} selectedDate={selectedDate} />} />
            <Route path="/command-center" element={<CommandCenterPage data={data} selectedDate={selectedDate} />} />
            <Route path="/teams" element={<TeamsPage selectedDate={selectedDate} />} />
            <Route path="/games" element={<GamesPage data={data} selectedDate={selectedDate} />} />
            <Route path="/players" element={<PlayersPage data={data} selectedDate={selectedDate} />} />
            <Route path="/pitchers" element={<PitchersPage selectedDate={selectedDate} />} />
            <Route path="/weather" element={<WeatherPage selectedDate={selectedDate} />} />
            <Route path="/mlb" element={<MLBPropsPage data={data} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />} />
            <Route path="/markets" element={<MLBPropsPage data={data} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />} />
            <Route path="/live" element={<LivePage data={data} selectedDate={selectedDate} />} />
            <Route path="/lineups" element={<LineupsPage data={data} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      {!isPropsExperience ? (
        <footer className="site-footer">
          <div className="site-footer-brand">
            <img src="/brand/growth-connectivity-icon.png" alt="SportsSense AI mark" />
            <div>
              <strong>SportsSense AI</strong>
              <span>Subscription-grade MLB research, pricing oversight, and live-sync operations.</span>
            </div>
          </div>
          <span>Built to preserve the modeling stack while giving the product a sharper, premium front-end experience.</span>
        </footer>
      ) : null}
    </div>
  );
}
