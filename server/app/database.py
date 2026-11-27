"""SQLite3 connection and transaction manager with strict FK enforcement."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from app.config import AppSettings


class DatabaseManager:
    """Manages SQLite3 connections, foreign-key pragmas, transactions, and DDL init."""

    def __init__(self, db_path: Path | str | None = None) -> None:
        resolved = db_path if db_path is not None else AppSettings().db_path
        self.db_path: Path | str = resolved if str(resolved) == ":memory:" else Path(resolved)

    def get_connection(self) -> sqlite3.Connection:
        """Open a SQLite connection with PRAGMA foreign_keys = ON and sqlite3.Row factory."""
        if isinstance(self.db_path, Path):
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path), isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA busy_timeout = 5000;")
        return conn

    @contextmanager
    def transaction(self, *, immediate: bool = False) -> Iterator[sqlite3.Connection]:
        """Context manager wrapping SQL operations in a transaction (DEFERRED or IMMEDIATE)."""
        conn = self.get_connection()
        begin_sql = "BEGIN IMMEDIATE" if immediate else "BEGIN"
        try:
            conn.execute(begin_sql)
            yield conn
            conn.execute("COMMIT")
        except Exception:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()

    @contextmanager
    def immediate_transaction(self) -> Iterator[sqlite3.Connection]:
        """Context manager executing inside a SQLite BEGIN IMMEDIATE write transaction."""
        with self.transaction(immediate=True) as conn:
            yield conn

    def init_schema(self, schema_path: Path | str | None = None) -> None:
        """Execute the canonical DDL script against the target SQLite database."""
        path = Path(schema_path) if schema_path is not None else AppSettings().schema_path
        sql = path.read_text(encoding="utf-8")
        conn = self.get_connection()
        try:
            conn.executescript(sql)
            conn.execute("PRAGMA foreign_keys = ON;")
        finally:
            conn.close()
