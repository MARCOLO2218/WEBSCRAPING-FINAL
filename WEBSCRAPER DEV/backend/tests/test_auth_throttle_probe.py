"""Guardas y contrato del ensayo PostgreSQL de SPEC-046."""

from unittest.mock import MagicMock

import pytest

from catalog_api.db import auth_throttle_probe as probe


def test_outcome_requires_exact_concurrency_contract():
    results = [None] * 8 + [900] * 24
    rows = [{"attempt_count": 9}, {"attempt_count": 9}]
    assert probe.validate_outcome(results, rows) == {
        "permitidos": 8,
        "bloqueados": 24,
        "contadores": [9, 9],
    }
    with pytest.raises(probe.Rejected, match="distinto"):
        probe.validate_outcome([None] * 9 + [900] * 23, rows)


def test_target_rejects_non_postgresql_before_queries():
    connection = MagicMock()
    connection.dialect.name = "sqlite"
    with pytest.raises(probe.Rejected, match="requiere PostgreSQL"):
        probe.require_target(connection, "7" * 64)
    connection.execute.assert_not_called()


def test_cli_refuses_execution_without_both_guards(monkeypatch):
    monkeypatch.setattr(probe, "create_engine", lambda *a, **kw: pytest.fail("No conectar"))
    with pytest.raises(SystemExit):
        probe.main(["--host", "127.0.0.1", "--expected-regional-hash", "7" * 64])
