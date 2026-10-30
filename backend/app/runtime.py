from __future__ import annotations

import os
import shutil
import tempfile
from collections.abc import Mapping
from pathlib import Path


def resolve_db_path(bundle_root: Path, env: Mapping[str, str] | None = None) -> Path:
    """Return a writable SQLite path for local, Docker and Vercel runtimes.

    Vercel ships the generated database inside the read-only function bundle, so
    copy it into the instance's temporary directory before SQLite opens it.
    """
    values = os.environ if env is None else env
    configured = values.get("DB_PATH")
    if configured:
        return Path(configured)

    bundled = Path(bundle_root) / "data" / "app.db"
    if not values.get("VERCEL"):
        return bundled

    target = Path(tempfile.gettempdir()) / "gb-wind-app.db"
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(bundled, target)
    return target
