# Backend

FastAPI service + ETL for the GB wind day-ahead portal.

Windows:
  python -m venv venv
  venv\Scripts\pip install -r requirements.txt -r requirements-dev.txt
  venv\Scripts\pytest
  venv\Scripts\uvicorn app.api.main:create_app --factory --port 8000
