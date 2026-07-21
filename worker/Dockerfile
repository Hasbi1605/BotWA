FROM python:3.11-slim-bookworm AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-ind \
    libmagic1 \
    curl \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS runtime
WORKDIR /app
COPY app/ ./app/
COPY config/ ./config/
COPY run.py ./
RUN addgroup --system rembugbot && adduser --system --ingroup rembugbot rembugbot \
    && mkdir -p /data/temp && chown -R rembugbot:rembugbot /data /app
USER rembugbot
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/live')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
