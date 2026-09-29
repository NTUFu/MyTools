from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATABASE_PATH = Path(__file__).with_name('mytools_ai_usage.sqlite3')


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute(
        '''
        CREATE TABLE IF NOT EXISTS ai_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            tool TEXT NOT NULL DEFAULT 'settings',
            action TEXT NOT NULL,
            succeeded INTEGER NOT NULL,
            input_tokens INTEGER,
            output_tokens INTEGER,
            latency_ms INTEGER NOT NULL,
            estimated_cost_usd REAL
        )
        '''
    )
    columns = {row['name'] for row in connection.execute('PRAGMA table_info(ai_usage)')}
    if 'tool' not in columns:
        connection.execute("ALTER TABLE ai_usage ADD COLUMN tool TEXT NOT NULL DEFAULT 'settings'")
    return connection


@contextmanager
def _database():
    connection = _connect()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def record_usage(
    *,
    provider: str,
    model: str,
    tool: str,
    action: str,
    succeeded: bool,
    input_tokens: int | None,
    output_tokens: int | None,
    latency_ms: int,
    input_cost_per_million: float | None,
    output_cost_per_million: float | None,
) -> None:
    estimated_cost: float | None = None
    if (
        input_tokens is not None
        and output_tokens is not None
        and input_cost_per_million is not None
        and output_cost_per_million is not None
    ):
        estimated_cost = (
            input_tokens * input_cost_per_million + output_tokens * output_cost_per_million
        ) / 1_000_000

    with _database() as connection:
        connection.execute(
            '''
            INSERT INTO ai_usage (
                created_at, provider, model, tool, action, succeeded,
                input_tokens, output_tokens, latency_ms, estimated_cost_usd
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                datetime.now(timezone.utc).isoformat(),
                provider,
                model,
                tool,
                action,
                int(succeeded),
                input_tokens,
                output_tokens,
                latency_ms,
                estimated_cost,
            ),
        )


def get_usage_summary() -> dict[str, Any]:
    with _database() as connection:
        totals = connection.execute(
            '''
            SELECT COUNT(*) AS request_count,
                   SUM(succeeded) AS success_count,
                   SUM(CASE WHEN succeeded = 0 THEN 1 ELSE 0 END) AS failure_count,
                   SUM(input_tokens) AS input_tokens,
                   SUM(output_tokens) AS output_tokens,
                   AVG(latency_ms) AS average_latency_ms,
                   SUM(estimated_cost_usd) AS estimated_cost_usd
            FROM ai_usage
            '''
        ).fetchone()
        by_provider = connection.execute(
            '''
                 SELECT provider, model, tool, COUNT(*) AS request_count,
                   SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
                   SUM(estimated_cost_usd) AS estimated_cost_usd
                 FROM ai_usage GROUP BY provider, model, tool ORDER BY request_count DESC
            '''
        ).fetchall()

    return {
        'requestCount': totals['request_count'] or 0,
        'successCount': totals['success_count'] or 0,
        'failureCount': totals['failure_count'] or 0,
        'inputTokens': totals['input_tokens'],
        'outputTokens': totals['output_tokens'],
        'averageLatencyMs': round(totals['average_latency_ms']) if totals['average_latency_ms'] is not None else None,
        'estimatedCostUsd': totals['estimated_cost_usd'],
        'byProviderModel': [dict(row) for row in by_provider],
    }


def clear_usage() -> None:
    with _database() as connection:
        connection.execute('DELETE FROM ai_usage')
