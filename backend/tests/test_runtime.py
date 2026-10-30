from pathlib import Path

from app.runtime import resolve_db_path


def test_db_path_env_takes_precedence(tmp_path):
    target = tmp_path / "custom.db"
    assert resolve_db_path(tmp_path, {"DB_PATH": str(target)}) == target


def test_local_runtime_uses_bundled_database(tmp_path):
    assert resolve_db_path(tmp_path, {}) == tmp_path / "data" / "app.db"


def test_vercel_runtime_copies_bundled_database(monkeypatch, tmp_path):
    bundle = tmp_path / "bundle"
    (bundle / "data").mkdir(parents=True)
    (bundle / "data" / "app.db").write_bytes(b"sqlite bytes")
    runtime_dir = tmp_path / "tmp"
    monkeypatch.setattr("app.runtime.tempfile.gettempdir", lambda: str(runtime_dir))

    result = resolve_db_path(bundle, {"VERCEL": "1"})

    assert result == runtime_dir / "gb-wind-app.db"
    assert result.read_bytes() == b"sqlite bytes"
