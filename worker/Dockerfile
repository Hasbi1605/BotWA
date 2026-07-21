FROM python:3.11-slim-bookworm AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-ind \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS runtime
COPY app/ ./app/
COPY config/ ./config/
RUN addgroup --system rembugbot && adduser --system --ingroup rembugbot rembugbot
RUN mkdir -p /data/temp && chown -R rembugbot:rembugbot /data
USER rembugbot
ENV PYTHONUNBUFFERED=1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
