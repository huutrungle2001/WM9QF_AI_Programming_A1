"""Aligned plain-text table renderer and timestamp helpers for the CLI."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any


def _stringify_cell(value: Any) -> str:
    if value is None:
        return "-"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value).replace("\r", " ").replace("\n", " ").strip()


def _truncate(text: str, max_width: int) -> str:
    if max_width < 1 or len(text) <= max_width:
        return text
    if max_width <= 3:
        return text[:max_width]
    return f"{text[: max_width - 3]}..."


def render_table(
    headers: Sequence[str],
    rows: Sequence[Sequence[Any]],
    max_col_width: int = 40,
) -> str:
    """Render an aligned ASCII table with header row, dashed separator, and crisp column widths."""
    if not headers:
        return ""

    col_count = len(headers)
    clean_headers = [_truncate(_stringify_cell(h), max_col_width) for h in headers]
    clean_rows: list[list[str]] = []
    for raw_row in rows:
        padded = list(raw_row)[:col_count]
        while len(padded) < col_count:
            padded.append(None)
        clean_rows.append([_truncate(_stringify_cell(cell), max_col_width) for cell in padded])

    widths = [len(h) for h in clean_headers]
    for row in clean_rows:
        for idx, cell in enumerate(row):
            if len(cell) > widths[idx]:
                widths[idx] = min(len(cell), max_col_width)

    header_line = " | ".join(f"{clean_headers[i]:<{widths[i]}}" for i in range(col_count))
    sep_line = "-+-".join("-" * widths[i] for i in range(col_count))

    lines = [header_line, sep_line]
    if not clean_rows:
        lines.append("(no records)")
    else:
        for row in clean_rows:
            lines.append(" | ".join(f"{row[i]:<{widths[i]}}" for i in range(col_count)))
    return "\n".join(lines)


def format_timestamp(epoch_seconds: int) -> str:
    """Format a UTC Unix epoch integer as YYYY-MM-DD HH:MM UTC."""
    dt = datetime.fromtimestamp(epoch_seconds, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d %H:%M UTC")


def parse_timestamp_arg(raw: str, field_name: str = "timestamp") -> int:
    """Parse either a Unix epoch integer string or ISO-8601 UTC timestamp string."""
    cleaned = raw.strip()
    if not cleaned:
        raise ValueError(f"Missing required {field_name}.")
    try:
        return int(cleaned)
    except ValueError:
        pass
    try:
        dt = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except ValueError as exc:
        raise ValueError(
            f"Invalid {field_name} '{cleaned}' (expected Unix seconds or ISO-8601 UTC, e.g. 2026-12-07T09:00:00Z)."
        ) from exc


def format_section_header(title: str) -> str:
    """Return a crisp underlined section banner for CLI output."""
    return f"\n{title}\n{'=' * len(title)}"

