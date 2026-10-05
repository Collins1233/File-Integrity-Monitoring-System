# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# Stage 2: Unified Python + FastAPI Server
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies if required for compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code, configuration, and default demo files
COPY backend/ ./backend/
COPY demo_files/ ./demo_files/

# Copy compiled React frontend assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Ensure Python can find modules in /app/backend and /app
ENV PYTHONPATH=/app/backend:/app
ENV PORT=10000
EXPOSE 10000

# Launch server binding to all interfaces and cloud-provided PORT
CMD ["sh", "-c", "uvicorn server:app --app-dir backend --host 0.0.0.0 --port ${PORT:-10000}"]
