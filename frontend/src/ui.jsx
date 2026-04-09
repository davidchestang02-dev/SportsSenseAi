import { useState } from "react";

import { getPlayerHeadshotUrl, getTeamBrand, getTeamLogoUrl, playerInitials } from "./media";

export function fmtPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

export function fmtSignedPercent(value) {
  const number = Number(value || 0) * 100;
  return `${number >= 0 ? "+" : ""}${number.toFixed(1)}%`;
}

export function fmtMoneyline(value) {
  const number = Number(value || 0);
  return `${number >= 0 ? "+" : ""}${Math.round(number)}`;
}

export function fmtDecimal(value) {
  return Number(value || 0).toFixed(2);
}

export function TeamMark({ team, compact = false }) {
  const [broken, setBroken] = useState(false);
  const brand = getTeamBrand(team);
  const logoUrl = getTeamLogoUrl(team);

  return (
    <span className={`team-pill${compact ? " compact" : ""}`}>
      <span
        className="team-logo-frame"
        style={{
          background: `linear-gradient(135deg, ${brand.colors[0]}, ${brand.colors[1]})`
        }}
      >
        {logoUrl && !broken ? (
          <img src={logoUrl} alt={`${team} logo`} onError={() => setBroken(true)} />
        ) : (
          <span>{brand.abbr}</span>
        )}
      </span>
      {!compact ? <span>{team}</span> : null}
    </span>
  );
}

export function PlayerPortrait({ player }) {
  const [broken, setBroken] = useState(false);
  const alt = `${player.player_name} portrait`;

  return (
    <div className="portrait">
      {!broken ? (
        <img src={getPlayerHeadshotUrl(player)} alt={alt} onError={() => setBroken(true)} />
      ) : (
        <span>{playerInitials(player.player_name)}</span>
      )}
    </div>
  );
}

export function MetricCard({ label, value, note }) {
  return (
    <article className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-note">{note}</span>
    </article>
  );
}

export function PagePanel({ eyebrow, title, description, action, children }) {
  return (
    <section className="page-panel">
      <div className="page-card-head">
        <div>
          <span className="section-eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>;
}
