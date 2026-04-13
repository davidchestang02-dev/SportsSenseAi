import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import { getPlayerHeadshotUrl, playerInitials } from "../../media";
import { useGamePreview, usePitcherProfile, usePregameSlate, useWeather } from "../../researchData";
import { buildMlbPropsGames, SPORTSBOOKS } from "./mockData";
import styles from "./MLBPropsPage.module.css";

const LEAGUE_TABS = ["MLB", "NBA", "NHL", "NFL"];
const PROP_TYPES = ["ALL", "HR", "HITS", "TB", "K"];
const SPORTSBOOK_LABELS = {
  draftkings: "DK",
  fanduel: "FD",
  betmgm: "MGM",
  prizepicks: "PP",
  underdog: "UD"
};
const PITCH_MIX_COLORS = ["#4DA3FF", "#00D4FF", "#FFC04D", "#FF4D4D", "#7C9BFF", "#4EF0A8"];

function round(value, digits = 1) {
  const precision = 10 ** digits;
  return Math.round(value * precision) / precision;
}

function formatStartTime(value) {
  if (!value) {
    return "Start time TBD";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatProbability(probability) {
  return `${Math.round((Number(probability) || 0) * 100)}%`;
}

function formatEdge(value) {
  const edge = Number(value || 0);
  return `${edge >= 0 ? "+" : ""}${edge.toFixed(2)}`;
}

function formatMetric(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "--";
  }

  return number.toFixed(digits);
}

function formatOneDecimal(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(1) : "--";
}

function formatPercentMetric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : "--";
}

function windDirectionLabel(degrees) {
  const normalized = Number(degrees);
  if (!Number.isFinite(normalized)) {
    return "Variable";
  }

  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round((((normalized % 360) + 360) % 360) / 45) % directions.length];
}

function weatherLabel(weather) {
  if (!weather) {
    return "WX pending";
  }

  if (weather.isDome) {
    return "Dome";
  }

  return `${weather.tempF ?? "--"}F | ${weather.windSpeed ?? "--"} mph ${windDirectionLabel(weather.windDir)}`;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findPreviewHitter(preview, playerName) {
  const hitters = [...(preview?.hittersHome || []), ...(preview?.hittersAway || [])];
  const target = normalizeName(playerName);
  return hitters.find((hitter) => normalizeName(hitter?.name) === target) || null;
}

function getProbabilityClass(probability) {
  const value = Number(probability || 0);
  if (value > 0.6) {
    return styles.probGood;
  }
  if (value < 0.4) {
    return styles.probBad;
  }
  return styles.probWarn;
}

function getEdgeClass(edge) {
  const value = Number(edge || 0);
  if (value > 0.12) {
    return styles.edgePositive;
  }
  if (value < -0.12) {
    return styles.edgeNegative;
  }
  return styles.edgeNeutral;
}

function sparklinePath(values, width = 280, height = 56) {
  if (!Array.isArray(values) || values.length === 0) {
    return "";
  }

  const numeric = values.map((value) => Number(value || 0));
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const range = max - min || 1;

  return numeric
    .map((value, index) => {
      const x = (index / Math.max(numeric.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function pitchMixGradient(pitchMix) {
  const entries = Object.entries(pitchMix || {}).filter(([, value]) => Number(value) > 0);
  if (entries.length === 0) {
    return "conic-gradient(#1A2337 0deg 360deg)";
  }

  const total = entries.reduce((sum, [, value]) => sum + Number(value || 0), 0) || 1;
  let current = 0;
  const segments = entries.map((entry, index) => {
    const degrees = (Number(entry[1] || 0) / total) * 360;
    const start = current;
    current += degrees;
    return `${PITCH_MIX_COLORS[index % PITCH_MIX_COLORS.length]} ${start}deg ${current}deg`;
  });

  return `conic-gradient(${segments.join(", ")})`;
}

function bookCellText(book, prop) {
  const market = prop?.sportsbooks?.[book];
  if (!market) {
    return "--";
  }

  if (typeof market.line === "number") {
    return String(market.line);
  }

  const over = typeof market.over === "number" ? `${market.over > 0 ? "+" : ""}${market.over}` : "--";
  const under = typeof market.under === "number" ? `${market.under > 0 ? "+" : ""}${market.under}` : "--";
  return `${over} / ${under}`;
}

function createFallbackPitchMix(prop) {
  return prop?.propType === "K"
    ? { FF: 43, SL: 24, CH: 17, CU: 16 }
    : { FF: 48, SL: 21, CH: 14, SI: 17 };
}

function selectedPitcherSide(game, prop) {
  const homePitcherId = Number(game?.probablePitchers?.home?.id || 0);
  const awayPitcherId = Number(game?.probablePitchers?.away?.id || 0);
  const playerId = Number(prop?.playerId || 0);

  if (playerId && playerId === homePitcherId) {
    return "home";
  }
  if (playerId && playerId === awayPitcherId) {
    return "away";
  }

  return prop?.teamAbbr === game?.homeTeam?.abbr ? "away" : "home";
}

function playerCardStatcast(prop, previewHitter) {
  if (previewHitter) {
    return {
      xwOBA: previewHitter.xwOBA,
      xBA: previewHitter.xBA,
      xSLG: previewHitter.xSLG,
      hardHitPct: previewHitter.hardHitPct,
      barrelPct: previewHitter.barrelPct,
      avgEV: previewHitter.avgEV,
      avgLA: previewHitter.avgLA
    };
  }

  return prop?.statcast || {};
}

function mergePitcherCardData(game, prop, previewPayload, pitcherProfile) {
  if (!game || !prop) {
    return null;
  }

  const side = selectedPitcherSide(game, prop);
  const probablePitcher = game?.probablePitchers?.[side] || null;
  const previewPitcher = side === "home" ? previewPayload?.pitcherHome : previewPayload?.pitcherAway;
  const profilePitcher = pitcherProfile?.data?.pitcher || null;
  const splits = (profilePitcher?.splits || []).filter((split) => {
    const label = String(split?.splitLabel || split?.splitCode || "").toLowerCase();
    return label.includes("vs") || label.includes("left") || label.includes("right") || label === "vl" || label === "vr";
  });

  return {
    id: probablePitcher?.id || previewPitcher?.playerId || profilePitcher?.espnPlayerId || null,
    name: probablePitcher?.name || previewPitcher?.name || profilePitcher?.name || "Probable pitcher",
    throws: previewPitcher?.throws || profilePitcher?.throws || "--",
    teamAbbr: side === "home" ? game.homeTeam.abbr : game.awayTeam.abbr,
    xERA: previewPitcher?.xERA ?? profilePitcher?.model?.fip ?? null,
    kPct: previewPitcher?.kPct ?? profilePitcher?.model?.kPct ?? null,
    bbPct: previewPitcher?.bbPct ?? profilePitcher?.model?.bbPct ?? null,
    hr9: profilePitcher?.hr9 ?? null,
    pitchMix: previewPitcher?.pitchMix || createFallbackPitchMix(prop),
    splits
  };
}

function buildFilteredGames(games, filters) {
  return games
    .map((game) => ({
      ...game,
      props: (game.props || []).filter((prop) => {
        if (filters.team !== "ALL" && prop.teamAbbr !== filters.team) {
          return false;
        }
        if (filters.propType !== "ALL" && prop.propType !== filters.propType) {
          return false;
        }
        if (filters.search && !String(prop.playerName || "").toLowerCase().includes(filters.search)) {
          return false;
        }
        return true;
      })
    }))
    .filter((game) => game.props.length > 0);
}

function booksSummary(selectedBooks) {
  if (selectedBooks.length === SPORTSBOOKS.length) {
    return "All books";
  }

  return selectedBooks.map((book) => SPORTSBOOK_LABELS[book]).join(", ");
}

function PlayerAvatar({ player, size = "regular" }) {
  const src = getPlayerHeadshotUrl(player);
  const label = player?.playerName || player?.name || player?.fullName || "Player";

  return (
    <div className={`${styles.avatar} ${size === "small" ? styles.avatarSmall : ""}`}>
      {src ? <img src={src} alt={`${label} headshot`} /> : <span>{playerInitials(label)}</span>}
    </div>
  );
}

function SkeletonBlock({ height = 16, width = "100%" }) {
  return <span className={styles.skeletonBlock} style={{ height, width }} aria-hidden="true" />;
}

export function FilterBar({
  selectedDate,
  onDateChange,
  teamOptions,
  filters,
  onFilterChange,
  selectedBooks,
  onToggleBook,
  onResetBooks,
  onResetFilters,
  booksOpen,
  onToggleBooksOpen
}) {
  return (
    <>
      <header className={styles.topbar}>
        <div className={styles.brandBlock}>
          <img className={styles.brandMark} src="/favicon.svg" alt="SportsSenseAi mark" />
          <div>
            <span className={styles.brandKicker}>SportsSenseAi</span>
            <strong>MLB Player Props Command Surface</strong>
          </div>
        </div>

        <nav className={styles.leagueTabs} aria-label="Sports">
          {LEAGUE_TABS.map((league) => (
            <button
              key={league}
              type="button"
              className={`${styles.leagueTab} ${league === "MLB" ? styles.leagueTabActive : ""}`}
              disabled={league !== "MLB"}
              aria-current={league === "MLB" ? "page" : undefined}
            >
              {league}
            </button>
          ))}
        </nav>

        <div className={styles.topTools}>
          <label className={styles.fieldStack}>
            <span>Date</span>
            <input
              className={styles.dateInput}
              type="date"
              value={selectedDate}
              onChange={(event) => startTransition(() => onDateChange(event.target.value))}
            />
          </label>

          <div className={styles.bookSelectWrap}>
            <button type="button" className={styles.bookSelectButton} onClick={onToggleBooksOpen}>
              {booksSummary(selectedBooks)}
            </button>
            {booksOpen ? (
              <div className={styles.bookMenu}>
                {SPORTSBOOKS.map((book) => (
                  <label key={book} className={styles.bookMenuOption}>
                    <input
                      type="checkbox"
                      checked={selectedBooks.includes(book)}
                      onChange={() => onToggleBook(book)}
                    />
                    <span>
                      {SPORTSBOOK_LABELS[book]} · {book}
                    </span>
                  </label>
                ))}
                <button type="button" className={styles.bookMenuReset} onClick={onResetBooks}>
                  Show all books
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <section className={styles.pageHeader}>
        <div>
          <p className={styles.pageEyebrow}>SportsSenseAi Projections vs Sportsbook Lines</p>
          <h1>MLB Player Props</h1>
          <p className={styles.pageSubheader}>
            Game-grouped prop research with projection deltas, book pricing, matchup context, and click-through Statcast detail.
          </p>
        </div>
        <div className={styles.pageHeaderMeta}>
          <span>{teamOptions.length - 1} teams</span>
          <span>{selectedBooks.length} books active</span>
        </div>
      </section>

      <div className={styles.headerRule} />

      <section className={styles.filterBar}>
        <div className={styles.filterGrid}>
          <label className={styles.fieldStack}>
            <span>Team</span>
            <select value={filters.team} onChange={(event) => onFilterChange("team", event.target.value)}>
              {teamOptions.map((team) => (
                <option key={team.value} value={team.value}>
                  {team.label}
                </option>
              ))}
            </select>
          </label>

          <label className={`${styles.fieldStack} ${styles.searchField}`}>
            <span>Player search</span>
            <input
              type="search"
              list="mlb-props-players"
              placeholder="Search hitter or pitcher"
              value={filters.player}
              onChange={(event) => onFilterChange("player", event.target.value)}
            />
          </label>

          <label className={styles.fieldStack}>
            <span>Prop type</span>
            <select value={filters.propType} onChange={(event) => onFilterChange("propType", event.target.value)}>
              {PROP_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.fieldStack}>
            <span>Sportsbooks</span>
            <button type="button" className={styles.inlineBookButton} onClick={onToggleBooksOpen}>
              {booksSummary(selectedBooks)}
            </button>
          </div>

          <button type="button" className={styles.resetButton} onClick={onResetFilters}>
            Reset filters
          </button>
        </div>
      </section>
    </>
  );
}

export function SportsbookOddsGrid({ prop, selectedBooks }) {
  return (
    <div className={styles.sportsbookGrid}>
      {selectedBooks.map((book) => (
        <article key={book} className={styles.sportsbookCell}>
          <span>{SPORTSBOOK_LABELS[book]}</span>
          <strong>{bookCellText(book, prop)}</strong>
        </article>
      ))}
    </div>
  );
}

export function StatcastMiniCard({ statcast }) {
  return (
    <article className={styles.statcastMiniCard}>
      <div className={styles.statcastMiniHeader}>
        <strong>Statcast profile</strong>
        <span title="Expected weighted on-base average and expected production indicators.">x profile</span>
      </div>
      <div className={styles.statcastMiniGrid}>
        <div title="Expected weighted on-base average">
          <span>xwOBA</span>
          <strong>{formatMetric(statcast?.xwOBA, 3)}</strong>
        </div>
        <div title="Expected batting average">
          <span>xBA</span>
          <strong>{formatMetric(statcast?.xBA, 3)}</strong>
        </div>
        <div title="Expected slugging percentage">
          <span>xSLG</span>
          <strong>{formatMetric(statcast?.xSLG, 3)}</strong>
        </div>
        <div title="Hard-hit percentage">
          <span>HardHit%</span>
          <strong>{formatPercentMetric(statcast?.hardHitPct)}</strong>
        </div>
        <div title="Barrel rate">
          <span>Barrel%</span>
          <strong>{formatPercentMetric(statcast?.barrelPct)}</strong>
        </div>
        <div title="Average exit velocity">
          <span>Avg EV</span>
          <strong>{formatOneDecimal(statcast?.avgEV)}</strong>
        </div>
        <div title="Average launch angle">
          <span>Avg LA</span>
          <strong>{formatOneDecimal(statcast?.avgLA)}</strong>
        </div>
      </div>
    </article>
  );
}

export function PlayerPropRow({ prop, game, index, isSelected, onSelect, selectedBooks }) {
  return (
    <>
      <tr
        className={[
          styles.rowMain,
          index % 2 === 1 ? styles.rowAlt : "",
          isSelected ? styles.rowSelected : ""
        ].join(" ").trim()}
        onClick={onSelect}
      >
        <td className={styles.playerCell}>
          <div className={styles.playerIdentity}>
            <PlayerAvatar player={{ playerId: prop.playerId, playerName: prop.playerName }} size="small" />
            <div>
              <strong>{prop.playerName}</strong>
              <div className={styles.playerMetaLine}>
                <span>{prop.teamAbbr}</span>
                <span className={styles.handBadge}>{prop.handedness || "--"}</span>
              </div>
            </div>
          </div>
        </td>
        <td className={styles.numericCell}>
          <strong>{Number(prop?.model?.mean || 0).toFixed(2)}</strong>
        </td>
        {selectedBooks.map((book) => (
          <td key={book} className={styles.numericCell}>
            {bookCellText(book, prop)}
          </td>
        ))}
        <td className={styles.numericCell}>
          <div className={styles.probabilityPair}>
            <span className={getProbabilityClass(prop?.model?.overProb)}>{formatProbability(prop?.model?.overProb)}</span>
            <small>{formatProbability(prop?.model?.underProb)} U</small>
          </div>
        </td>
        <td className={`${styles.numericCell} ${getEdgeClass(prop?.model?.edge)}`}>
          {formatEdge(prop?.model?.edge)}
        </td>
      </tr>

      <tr className={styles.expandedRow}>
        <td colSpan={selectedBooks.length + 4}>
          <div className={`${styles.expandPanel} ${isSelected ? styles.expandPanelOpen : ""}`}>
            <div className={styles.expandPanelInner}>
              <StatcastMiniCard statcast={prop?.statcast} />
              <div className={styles.expandSummary}>
                <div className={styles.expandSummaryHead}>
                  <strong>{prop.propType} summary</strong>
                  <span>
                    {game.awayTeam.abbr} @ {game.homeTeam.abbr}
                  </span>
                </div>
                <p>
                  SportsSenseAi projects <strong>{Number(prop?.model?.mean || 0).toFixed(2)}</strong> against a market line of{" "}
                  <strong>{prop.line}</strong>, with {formatProbability(prop?.model?.overProb)} over probability.
                </p>
                <SportsbookOddsGrid prop={prop} selectedBooks={selectedBooks} />
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

export function PlayerPropTable({ game, props, selectedBooks, selectedPropKey, onSelectProp }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.propsTable}>
        <thead>
          <tr>
            <th>Player</th>
            <th>Projection</th>
            {selectedBooks.map((book) => (
              <th key={book}>{SPORTSBOOK_LABELS[book]}</th>
            ))}
            <th>O/U probs</th>
            <th>Edge</th>
          </tr>
        </thead>
        <tbody>
          {props.map((prop, index) => {
            const propKey = `${game.gamePk}-${prop.playerId}-${prop.propType}`;
            return (
              <PlayerPropRow
                key={propKey}
                game={game}
                index={index}
                prop={prop}
                selectedBooks={selectedBooks}
                isSelected={selectedPropKey === propKey}
                onSelect={() => onSelectProp(prop)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function GameSection({
  game,
  isOpen,
  onToggle,
  selectedBooks,
  selectedPropKey,
  onSelectProp
}) {
  return (
    <section className={`${styles.gameSection} ${isOpen ? styles.gameSectionOpen : ""}`}>
      <button type="button" className={styles.gameSectionHeader} onClick={onToggle}>
        <div className={styles.gameHeading}>
          <div>
            <p className={styles.gameLabel}>{game.awayTeam.name} @ {game.homeTeam.name}</p>
            <h2>
              {game.awayTeam.abbr} @ {game.homeTeam.abbr}
            </h2>
          </div>
          <div className={styles.gameHeaderDetails}>
            <span>{formatStartTime(game.startTime)}</span>
            <span>
              {game.probablePitchers.away?.name || "TBD"} vs {game.probablePitchers.home?.name || "TBD"}
            </span>
          </div>
        </div>

        <div className={styles.gameHeaderMeta}>
          <span className={styles.weatherChip}>WX · {weatherLabel(game.weather)}</span>
          <span className={styles.propsCount}>{game?.props?.length || 0} props</span>
          <span className={`${styles.collapseIcon} ${isOpen ? styles.collapseIconOpen : ""}`}>+</span>
        </div>
      </button>

      <div className={`${styles.gameSectionBody} ${isOpen ? styles.gameSectionBodyOpen : ""}`}>
        <div className={styles.gameSectionInner}>
          <PlayerPropTable
            game={game}
            props={game.props}
            selectedBooks={selectedBooks}
            selectedPropKey={selectedPropKey}
            onSelectProp={onSelectProp}
          />
        </div>
      </div>
    </section>
  );
}

export function PlayerProfileCard({ selectedProp, previewHitter }) {
  if (!selectedProp) {
    return (
      <section className={styles.sidebarCard}>
        <div className={styles.sidebarCardHeader}>
          <span>Player profile</span>
          <strong>Select a row</strong>
        </div>
        <p className={styles.sidebarEmpty}>
          Click any prop row to open the full SportsSenseAi player card, recent trendline, and advanced Statcast profile.
        </p>
      </section>
    );
  }

  const statcast = playerCardStatcast(selectedProp, previewHitter);
  const sparkline = sparklinePath(selectedProp.recentForm || []);

  return (
    <section className={styles.sidebarCard}>
      <div className={styles.sidebarCardHeader}>
        <span>Player profile</span>
        <strong>{selectedProp.propType}</strong>
      </div>

      <div className={styles.playerProfileHead}>
        <PlayerAvatar player={{ playerId: selectedProp.playerId, playerName: selectedProp.playerName }} />
        <div>
          <h3>{selectedProp.playerName}</h3>
          <p>
            {selectedProp.teamAbbr} · {selectedProp.handedness || "--"} handed
          </p>
        </div>
      </div>

      <div className={styles.profileMetrics}>
        <div title="Expected weighted on-base average">
          <span>xwOBA</span>
          <strong>{formatMetric(statcast?.xwOBA, 3)}</strong>
        </div>
        <div title="Expected batting average">
          <span>xBA</span>
          <strong>{formatMetric(statcast?.xBA, 3)}</strong>
        </div>
        <div title="Expected slugging">
          <span>xSLG</span>
          <strong>{formatMetric(statcast?.xSLG, 3)}</strong>
        </div>
        <div title="Hard-hit rate">
          <span>HardHit%</span>
          <strong>{formatPercentMetric(statcast?.hardHitPct)}</strong>
        </div>
        <div title="Barrel rate">
          <span>Barrel%</span>
          <strong>{formatPercentMetric(statcast?.barrelPct)}</strong>
        </div>
        <div title="Average exit velocity">
          <span>Avg EV</span>
          <strong>{formatOneDecimal(statcast?.avgEV)}</strong>
        </div>
        <div title="Average launch angle">
          <span>Avg LA</span>
          <strong>{formatOneDecimal(statcast?.avgLA)}</strong>
        </div>
      </div>

      <div className={styles.sparklineBlock}>
        <div className={styles.sparklineHeader}>
          <strong>Last 10 games</strong>
          <span>{selectedProp.propType} form</span>
        </div>
        <svg viewBox="0 0 280 56" className={styles.sparkline} role="img" aria-label="Recent form sparkline">
          <path d={sparkline} />
        </svg>
        <div className={styles.sparklineLabels}>
          {(selectedProp.recentForm || []).slice(-5).map((value, index) => (
            <span key={`${value}-${index}`}>{Number(value || 0).toFixed(1)}</span>
          ))}
        </div>
      </div>

      <div className={styles.projectionSummary}>
        <strong>SportsSenseAi projection summary</strong>
        <p>
          Mean <strong>{Number(selectedProp?.model?.mean || 0).toFixed(2)}</strong> against line <strong>{selectedProp.line}</strong> with{" "}
          <span className={getProbabilityClass(selectedProp?.model?.overProb)}>{formatProbability(selectedProp?.model?.overProb)} over</span> and edge{" "}
          <span className={getEdgeClass(selectedProp?.model?.edge)}>{formatEdge(selectedProp?.model?.edge)}</span>.
        </p>
      </div>
    </section>
  );
}

export function PitcherMatchupCard({ pitcherCard, loading }) {
  if (loading) {
    return (
      <section className={styles.sidebarCard}>
        <div className={styles.sidebarCardHeader}>
          <span>Pitcher matchup</span>
          <strong>Loading</strong>
        </div>
        <div className={styles.skeletonStack}>
          <SkeletonBlock height={52} />
          <SkeletonBlock height={150} />
          <SkeletonBlock height={92} />
        </div>
      </section>
    );
  }

  if (!pitcherCard) {
    return (
      <section className={styles.sidebarCard}>
        <div className={styles.sidebarCardHeader}>
          <span>Pitcher matchup</span>
          <strong>Preview pending</strong>
        </div>
        <p className={styles.sidebarEmpty}>
          Pitch mix, xERA, and handedness splits will populate once a game and player are selected.
        </p>
      </section>
    );
  }

  const splitRows = pitcherCard.splits.slice(0, 2);
  const pitchMixEntries = Object.entries(pitcherCard.pitchMix || {}).sort((left, right) => Number(right[1]) - Number(left[1]));

  return (
    <section className={styles.sidebarCard}>
      <div className={styles.sidebarCardHeader}>
        <span>Pitcher matchup</span>
        <strong>{pitcherCard.teamAbbr}</strong>
      </div>

      <div className={styles.playerProfileHead}>
        <PlayerAvatar player={{ playerId: pitcherCard.id, playerName: pitcherCard.name }} />
        <div>
          <h3>{pitcherCard.name}</h3>
          <p>
            {pitcherCard.teamAbbr} · Throws {pitcherCard.throws}
          </p>
        </div>
      </div>

      <div className={styles.pitchMixBlock}>
        <div className={styles.pitchMixDonut} style={{ background: pitchMixGradient(pitcherCard.pitchMix) }}>
          <div className={styles.pitchMixDonutInner}>Pitch mix</div>
        </div>
        <div className={styles.pitchMixLegend}>
          {pitchMixEntries.map(([pitch, share], index) => (
            <div key={pitch} className={styles.pitchMixLegendRow}>
              <span className={styles.pitchMixSwatch} style={{ backgroundColor: PITCH_MIX_COLORS[index % PITCH_MIX_COLORS.length] }} />
              <span>{pitch}</span>
              <strong>{Math.round(Number(share || 0))}%</strong>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.profileMetrics}>
        <div title="Expected ERA">
          <span>xERA</span>
          <strong>{formatOneDecimal(pitcherCard.xERA)}</strong>
        </div>
        <div title="Strikeout rate">
          <span>K%</span>
          <strong>{formatPercentMetric(pitcherCard.kPct)}</strong>
        </div>
        <div title="Walk rate">
          <span>BB%</span>
          <strong>{formatPercentMetric(pitcherCard.bbPct)}</strong>
        </div>
        <div title="Home runs allowed per nine innings">
          <span>HR/9</span>
          <strong>{formatOneDecimal(pitcherCard.hr9)}</strong>
        </div>
      </div>

      <div className={styles.splitBlock}>
        <div className={styles.sparklineHeader}>
          <strong>Batter handedness splits</strong>
          <span>Persisted ESPN splits</span>
        </div>
        {splitRows.length > 0 ? (
          splitRows.map((split) => (
            <div key={`${split.splitCode}-${split.splitLabel}`} className={styles.splitRow}>
              <div>
                <strong>{split.splitLabel || split.splitCode}</strong>
                <span>{split.ip || "--"} IP</span>
              </div>
              <div>
                <span>ERA {split.era || "--"}</span>
                <span>K/9 {split.k9 || "--"}</span>
              </div>
            </div>
          ))
        ) : (
          <p className={styles.sidebarEmpty}>No handedness split rows have been returned for this pitcher yet.</p>
        )}
      </div>
    </section>
  );
}

export function MLBPropsPage({ data, selectedDate, setSelectedDate }) {
  const pregame = usePregameSlate(selectedDate);
  const weather = useWeather(selectedDate);
  const [filters, setFilters] = useState({ team: "ALL", player: "", propType: "ALL" });
  const [booksOpen, setBooksOpen] = useState(false);
  const [selectedBooks, setSelectedBooks] = useState(SPORTSBOOKS);
  const [collapsedGames, setCollapsedGames] = useState({});
  const deferredPlayerSearch = useDeferredValue(filters.player.trim().toLowerCase());

  const propsGames = useMemo(
    () =>
      buildMlbPropsGames({
        bundle: data,
        pregameSlate: pregame.data,
        weatherBoard: weather.data
      }),
    [data, pregame.data, weather.data]
  );

  const filteredGames = useMemo(
    () =>
      buildFilteredGames(propsGames, {
        team: filters.team,
        propType: filters.propType,
        search: deferredPlayerSearch
      }),
    [propsGames, filters.team, filters.propType, deferredPlayerSearch]
  );

  const teamOptions = useMemo(() => {
    const values = new Set(["ALL"]);
    propsGames.forEach((game) => {
      values.add(game.awayTeam.abbr);
      values.add(game.homeTeam.abbr);
    });
    return Array.from(values).map((value) => ({
      value,
      label: value === "ALL" ? "All teams" : value
    }));
  }, [propsGames]);

  const playerOptions = useMemo(() => {
    const seen = new Set();
    return filteredGames.flatMap((game) =>
      game.props
        .map((prop) => prop.playerName)
        .filter((playerName) => {
          if (seen.has(playerName)) {
            return false;
          }
          seen.add(playerName);
          return true;
        })
    );
  }, [filteredGames]);

  const firstGame = filteredGames[0] || null;
  const [selectedGameId, setSelectedGameId] = useState("");
  const [selectedPropKey, setSelectedPropKey] = useState("");

  useEffect(() => {
    if (!firstGame) {
      setSelectedGameId("");
      setSelectedPropKey("");
      return;
    }

    const hasSelectedGame = filteredGames.some((game) => String(game.gamePk) === String(selectedGameId));
    if (!hasSelectedGame) {
      setSelectedGameId(String(firstGame.gamePk));
    }
  }, [filteredGames, firstGame, selectedGameId]);

  const selectedGame =
    filteredGames.find((game) => String(game.gamePk) === String(selectedGameId)) ||
    firstGame;

  useEffect(() => {
    if (!selectedGame?.props?.length) {
      setSelectedPropKey("");
      return;
    }

    const propExists = selectedGame.props.some(
      (prop) => `${selectedGame.gamePk}-${prop.playerId}-${prop.propType}` === selectedPropKey
    );
    if (!propExists) {
      const firstProp = selectedGame.props[0];
      setSelectedPropKey(`${selectedGame.gamePk}-${firstProp.playerId}-${firstProp.propType}`);
    }
  }, [selectedGame, selectedPropKey]);

  const selectedProp =
    selectedGame?.props?.find((prop) => `${selectedGame.gamePk}-${prop.playerId}-${prop.propType}` === selectedPropKey) ||
    selectedGame?.props?.[0] ||
    null;

  const preview = useGamePreview(selectedGame?.gameId, selectedDate);
  const previewPayload = preview.data?.data?.preview || null;
  const previewHitter = selectedProp ? findPreviewHitter(previewPayload, selectedProp.playerName) : null;
  const pitcherSide = selectedGame && selectedProp ? selectedPitcherSide(selectedGame, selectedProp) : null;
  const probablePitcher = pitcherSide && selectedGame ? selectedGame.probablePitchers[pitcherSide] : null;
  const pitcherProfile = usePitcherProfile(probablePitcher?.id, selectedDate);
  const pitcherCard = useMemo(
    () => mergePitcherCardData(selectedGame, selectedProp, previewPayload, pitcherProfile),
    [selectedGame, selectedProp, previewPayload, pitcherProfile]
  );

  function handleFilterChange(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function handleResetFilters() {
    setFilters({ team: "ALL", player: "", propType: "ALL" });
    setSelectedBooks(SPORTSBOOKS);
  }

  function handleToggleBook(book) {
    setSelectedBooks((current) => {
      if (current.includes(book)) {
        return current.length === 1 ? current : current.filter((entry) => entry !== book);
      }
      return [...current, book];
    });
  }

  function handleSelectProp(game, prop) {
    setSelectedGameId(String(game.gamePk));
    setSelectedPropKey(`${game.gamePk}-${prop.playerId}-${prop.propType}`);
  }

  function toggleGame(gamePk) {
    setCollapsedGames((current) => ({
      ...current,
      [gamePk]: !current[gamePk]
    }));
    setSelectedGameId(String(gamePk));
  }

  const loading = data?.loading || pregame.loading || weather.loading;

  return (
    <div className={styles.propsPage}>
      <FilterBar
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        teamOptions={teamOptions}
        filters={filters}
        onFilterChange={handleFilterChange}
        selectedBooks={selectedBooks}
        onToggleBook={handleToggleBook}
        onResetBooks={() => setSelectedBooks(SPORTSBOOKS)}
        onResetFilters={handleResetFilters}
        booksOpen={booksOpen}
        onToggleBooksOpen={() => setBooksOpen((current) => !current)}
      />

      <datalist id="mlb-props-players">
        {playerOptions.map((player) => (
          <option key={player} value={player} />
        ))}
      </datalist>

      {data?.error ? <div className={styles.inlineWarning}>Primary bundle warning: {data.error}</div> : null}
      {preview.error ? <div className={styles.inlineWarning}>Preview warning: {preview.error}</div> : null}

      <div className={styles.contentGrid}>
        <div className={styles.leftColumn}>
          {loading && filteredGames.length === 0 ? (
            <div className={styles.loadingStack}>
              <section className={styles.gameSection}>
                <div className={styles.gameSectionHeaderStatic}>
                  <div>
                    <SkeletonBlock height={12} width={120} />
                    <SkeletonBlock height={28} width={220} />
                  </div>
                  <SkeletonBlock height={18} width={160} />
                </div>
                <div className={styles.loadingTable}>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <SkeletonBlock key={index} height={44} />
                  ))}
                </div>
              </section>
            </div>
          ) : filteredGames.length > 0 ? (
            filteredGames.map((game) => (
              <GameSection
                key={game.gamePk}
                game={game}
                isOpen={!collapsedGames[game.gamePk]}
                onToggle={() => toggleGame(game.gamePk)}
                selectedBooks={selectedBooks}
                selectedPropKey={selectedGameId === String(game.gamePk) ? selectedPropKey : ""}
                onSelectProp={(prop) => handleSelectProp(game, prop)}
              />
            ))
          ) : (
            <section className={styles.emptyPanel}>
              <strong>No props matched the current filters.</strong>
              <p>Reset the filters or widen the sportsbook selection to reopen the board.</p>
            </section>
          )}
        </div>

        <aside className={styles.rightColumn}>
          <PlayerProfileCard selectedProp={selectedProp} previewHitter={previewHitter} />
          <PitcherMatchupCard pitcherCard={pitcherCard} loading={preview.loading || pitcherProfile.loading} />
        </aside>
      </div>
    </div>
  );
}

export default MLBPropsPage;
