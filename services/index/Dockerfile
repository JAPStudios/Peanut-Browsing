FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV INDEX_DB_PATH=/data/index.sqlite

WORKDIR /app
RUN python -c "import sqlite3; sqlite3.connect(':memory:').execute('CREATE VIRTUAL TABLE probe USING fts5(value)')"
COPY server.py /app/server.py
RUN useradd --system --uid 10001 --create-home peanut-index && \
    mkdir -p /data && chown -R peanut-index:peanut-index /app /data
USER peanut-index

EXPOSE 8081
CMD ["python", "/app/server.py"]
