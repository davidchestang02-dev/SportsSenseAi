import { useState } from "react";

import { getPlayerHeadshotUrl, getTeamBrand, getTeamLabel, getTeamLogoUrl, playerInitials } from "./media";

export function fmtPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

export function fmtRate(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) {
    return "--";
  }

  if (number >= 1) {
    return number.toFixed(3);
  }

  return number.toFixed(3).replace(/^0/, "");
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
  const label = getTeamLabel(team);

  return (
    <span className={`team-pill${compact ? " compact" : ""}`}>
      <span
        className="team-logo-frame"
        style={{
          background: `linear-gradient(135deg, ${brand.color}, ${brand.alternateColor})`
        }}
      >
        {logoUrl && !broken ? (
          <img src={logoUrl} alt={`${label} logo`} onError={() => setBroken(true)} />
        ) : (
          <span>{brand.abbreviation}</span>
        )}
      </span>
      {!compact ? <span>{label}</span> : null}
    </span>
  );
}

export function PlayerPortrait({ player }) {
  const [broken, setBroken] = useState(false);
  const playerName = player?.fullName || player?.player_name || "Player";
  const alt = `${playerName} portrait`;

  return (
    <div className="portrait">
      {!broken ? (
        <img src={getPlayerHeadshotUrl(player)} alt={alt} onError={() => setBroken(true)} />
      ) : (
        <span>{playerInitials(playerName)}</span>
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
