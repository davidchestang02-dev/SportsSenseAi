#!/usr/bin/env python3
"""
Flatten RotoWire MLB player-props proxy payloads into a SQL-ready table.

This script is designed for the payload captured by the Playwright proxy layer.
It handles the common case where player metadata and prop arrays arrive separately
and joins them on player_id before writing into SQLite.

Optional:
- POST the raw payload into the SportsSenseAi worker so the D1-backed app can
  persist the richer market feed too.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sqlite3
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


BOOK_KEY_TO_COLUMN = {
    "draftkings": "dk_odds",
    "fanduel": "fd_odds",
    "betmgm": "mgm_odds",
    "mgm": "mgm_odds",
}

PROP_ALIASES = {
    "strikeouts": "strikeouts",
    "earnedruns": "earned_runs",
    "er": "earned_runs",
    "bases": "total_bases",
    "totalbases": "total_bases",
    "runs": "runs_scored",
    "hits": "hits",
    "homeruns": "home_runs",
    "hr": "home_runs",
}


def clean_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def number_or_none(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text or text.lower() in {"none", "null", "off"}:
        return None
    filtered = "".join(character for character in text if character in "0123456789.-+")
    if not filtered:
        return None
    try:
        return float(filtered)
    except ValueError:
        return None


def int_or_none(value: Any) -> int | None:
    number = number_or_none(value)
    if number is None:
        return None
    return int(round(number))


def normalize_prop_key(value: str | None) -> str:
    compact = "".join(character for character in str(value or "").lower() if character.isalpha())
    return PROP_ALIASES.get(compact, compact or "unknown")


def player_id_from_record(record: dict[str, Any] | None) -> int | None:
    if not isinstance(record, dict):
        return None
    return int_or_none(
        record.get("player_id")
        or record.get("playerId")
        or record.get("playerID")
        or record.get("athleteId")
        or record.get("athlete_id")
        or record.get("id")
    )


def is_player_collection_key(key: str) -> bool:
    lowered = key.lower()
    return "players" in lowered or "athletes" in lowered or "roster" in lowered


def looks_like_market_object(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    return any(key in value for key in ("line", "over", "under", "overOdds", "underOdds", "odds"))


def build_player_lookup(payload: Any) -> dict[int, dict[str, Any]]:
    lookup: dict[int, dict[str, Any]] = {}

    def visit(node: Any, key_hint: str = "") -> None:
        if isinstance(node, list):
            if is_player_collection_key(key_hint):
                for item in node:
                    if not isinstance(item, dict):
                        continue
                    player_id = player_id_from_record(item)
                    if player_id is not None:
                        lookup[player_id] = item
                return

            for item in node:
                if isinstance(item, (dict, list)):
                    visit(item, key_hint)
            return

        if not isinstance(node, dict):
            return

        for key, value in node.items():
            visit(value, key)

    visit(payload)
    return lookup


def extract_nested_books(record: dict[str, Any]) -> dict[str, dict[str, float | None]]:
    books: dict[str, dict[str, float | None]] = {}
    for book in BOOK_KEY_TO_COLUMN:
        market = record.get(book)
        if not looks_like_market_object(market):
            continue
        books[book] = {
            "line": number_or_none(market.get("line")),
            "over": number_or_none(market.get("over") or market.get("overOdds") or market.get("odds")),
            "under": number_or_none(market.get("under") or market.get("underOdds")),
        }
    return books


def extract_prefixed_books(record: dict[str, Any], prop_key: str) -> dict[str, dict[str, float | None]]:
    books: dict[str, dict[str, float | None]] = {}
    for book in BOOK_KEY_TO_COLUMN:
        line = number_or_none(record.get(f"{book}_{prop_key}"))
        over = number_or_none(record.get(f"{book}_{prop_key}Over"))
        under = number_or_none(record.get(f"{book}_{prop_key}Under"))
        if line is None and over is None and under is None:
            continue
        books[book] = {"line": line, "over": over, "under": under}
    return books


def merge_books(*sources: dict[str, dict[str, float | None]]) -> dict[str, dict[str, float | None]]:
    merged: dict[str, dict[str, float | None]] = {}
    for source in sources:
        for book, market in source.items():
            existing = merged.setdefault(book, {"line": None, "over": None, "under": None})
            for field in ("line", "over", "under"):
                if market.get(field) is not None:
                    existing[field] = market[field]
    return merged


def collect_prop_groups(batch: dict[str, Any]) -> list[tuple[str, list[dict[str, Any]]]]:
    groups: list[tuple[str, list[dict[str, Any]]]] = []

    direct_rows = None
    if isinstance(batch.get("props"), list):
        direct_rows = batch["props"]
    elif isinstance(batch.get("data"), list):
        direct_rows = batch["data"]

    direct_prop_key = clean_string(batch.get("prop") or batch.get("type") or batch.get("propType"))
    if direct_rows and direct_prop_key:
        rows = [row for row in direct_rows if isinstance(row, dict)]
        if rows:
            groups.append((direct_prop_key, rows))

    for key, value in batch.items():
        if not isinstance(value, list) or is_player_collection_key(key):
            continue
        rows = [row for row in value if isinstance(row, dict)]
        if not rows:
            continue
        if not any(player_id_from_record(row) is not None for row in rows):
            continue
        if not any(extract_nested_books(row) or extract_prefixed_books(row, key) for row in rows):
            continue
        groups.append((key, rows))

    return groups


def flatten_payload(payload: Any, fetch_date: str) -> list[dict[str, Any]]:
    batches = payload if isinstance(payload, list) else [payload]
    flattened: list[dict[str, Any]] = []

    for batch in batches:
        if not isinstance(batch, dict):
            continue

        player_lookup = build_player_lookup(batch)
        for prop_key_raw, rows in collect_prop_groups(batch):
            prop_key = clean_string(prop_key_raw) or "unknown"
            normalized_prop_type = normalize_prop_key(prop_key)

            for row in rows:
                player_id = player_id_from_record(row)
                player = player_lookup.get(player_id) if player_id is not None else None
                merged = {**(player or {}), **row}

                books = merge_books(
                    extract_prefixed_books(merged, prop_key),
                    extract_nested_books(merged),
                )
                if not books:
                    continue

                player_name = clean_string(
                    merged.get("playerName")
                    or merged.get("player")
                    or merged.get("name")
                    or " ".join(
                        value
                        for value in [
                            clean_string(merged.get("firstName")),
                            clean_string(merged.get("lastName")),
                        ]
                        if value
                    )
                ) or "Unknown Player"

                team = clean_string(merged.get("team") or merged.get("teamAbbr")) or "UNK"
                line = next((market["line"] for market in books.values() if market.get("line") is not None), None)

                flattened.append(
                    {
                        "fetch_date": fetch_date,
                        "player_name": player_name,
                        "team": team,
                        "prop_type": normalized_prop_type,
                        "prop_line": line,
                        "dk_odds": int_or_none(books.get("draftkings", {}).get("over")),
                        "fd_odds": int_or_none(books.get("fanduel", {}).get("over")),
                        "mgm_odds": int_or_none(
                            books.get("betmgm", {}).get("over")
                            if "betmgm" in books
                            else books.get("mgm", {}).get("over")
                        ),
                    }
                )

    deduped: dict[str, dict[str, Any]] = {}
    for row in flattened:
        unique_prop_id = (
            f"{row['fetch_date']}|{row['player_name']}|{row['team']}|"
            f"{row['prop_type']}|{row['prop_line']}"
        ).replace(" ", "_")
        row["unique_prop_id"] = unique_prop_id
        deduped[unique_prop_id] = row

    return list(deduped.values())


def ensure_sqlite_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_player_props (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fetch_date DATE DEFAULT (CURRENT_DATE),
            player_name TEXT,
            team TEXT,
            prop_type TEXT,
            prop_line REAL,
            dk_odds INTEGER,
            fd_odds INTEGER,
            mgm_odds INTEGER,
            unique_prop_id TEXT UNIQUE
        )
        """
    )
    connection.commit()


def upsert_rows(connection: sqlite3.Connection, rows: list[dict[str, Any]]) -> None:
    ensure_sqlite_schema(connection)
    connection.executemany(
        """
        INSERT INTO daily_player_props (
            fetch_date,
            player_name,
            team,
            prop_type,
            prop_line,
            dk_odds,
            fd_odds,
            mgm_odds,
            unique_prop_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(unique_prop_id) DO UPDATE SET
            dk_odds = excluded.dk_odds,
            fd_odds = excluded.fd_odds,
            mgm_odds = excluded.mgm_odds
        """,
        [
            (
                row["fetch_date"],
                row["player_name"],
                row["team"],
                row["prop_type"],
                row["prop_line"],
                row["dk_odds"],
                row["fd_odds"],
                row["mgm_odds"],
                row["unique_prop_id"],
            )
            for row in rows
        ],
    )
    connection.commit()


def post_payload(url: str, payload: Any) -> None:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            sys.stdout.write(response.read().decode("utf-8"))
            sys.stdout.write("\n")
    except urllib.error.URLError as error:
        raise RuntimeError(f"Failed to POST payload to {url}: {error}") from error


def main() -> int:
    parser = argparse.ArgumentParser(description="Flatten RotoWire MLB player-props proxy JSON into SQLite-ready rows.")
    parser.add_argument("json_file", type=Path, help="Path to the raw proxy JSON captured by Playwright.")
    parser.add_argument("--db", type=Path, default=Path("mlb_stats.db"), help="SQLite database path.")
    parser.add_argument(
        "--date",
        default=dt.date.today().isoformat(),
        help="Fetch date to stamp onto inserted rows. Defaults to today.",
    )
    parser.add_argument(
        "--post-url",
        default="",
        help="Optional SportsSenseAi worker endpoint, for example https://.../admin/mlb/props-sync?date=YYYY-MM-DD",
    )
    args = parser.parse_args()

    payload = json.loads(args.json_file.read_text(encoding="utf-8"))
    rows = flatten_payload(payload, args.date)

    connection = sqlite3.connect(args.db)
    try:
        upsert_rows(connection, rows)
    finally:
        connection.close()

    print(f"Loaded {len(rows)} rows into {args.db}")

    if args.post_url:
        post_payload(args.post_url, payload)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
