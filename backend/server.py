from pathlib import Path

from app.api.main import create_app
from app.runtime import resolve_db_path

app = create_app(db_path=resolve_db_path(Path(__file__).resolve().parent))
