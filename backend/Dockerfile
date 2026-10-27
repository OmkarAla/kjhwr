FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY scripts ./scripts
COPY db_seed ./db_seed
ENV DB_PATH=/srv/data/app.db
RUN mkdir -p /srv/baked /srv/data && python scripts/build_db_docker.py
CMD ["sh", "-c", "mkdir -p $(dirname ${DB_PATH}) && { test -f ${DB_PATH} || cp /srv/baked/app.db ${DB_PATH}; } && uvicorn app.api.main:create_app --factory --host 0.0.0.0 --port ${PORT:-8000}"]
