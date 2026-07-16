# ============================================
# Stage 1: Build Go backend binary
# ============================================
ARG VERSION=dev

FROM golang:1.26-alpine AS go-builder
RUN apk add --no-cache gcc musl-dev
WORKDIR /build
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w -X tano_blog/backend/internal/version.Version=${VERSION}" -o /build/server ./cmd/server/main.go

# ============================================
# Stage 2: Build Next.js frontend (standalone)
# ============================================
FROM node:22-alpine AS next-builder
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./

# In Docker, API calls use relative paths (proxied via Next.js rewrites)
ENV NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_APP_VERSION=${VERSION}

RUN npm run build

# Prepare standalone output
RUN cp -r .next/standalone/. /build/standalone/ && \
    cp -r .next/static /build/standalone/.next/static && \
    cp -r public /build/standalone/public && \
    rm -rf /build/standalone/node_modules
# Install only production deps for the standalone server
RUN cd /build/standalone && npm install --omit=dev

# ============================================
# Stage 3: Production image
# ============================================
FROM alpine:3.20

# Install runtime dependencies: Node.js for Next.js standalone, ca-certificates for HTTPS
RUN apk add --no-cache nodejs ca-certificates bash tzdata

WORKDIR /app

# Copy Go binary
COPY --from=go-builder /build/server .

# Copy Next.js standalone app
COPY --from=next-builder /build/standalone ./next

# Create data directories (uploads, backups)
RUN mkdir -p /data/uploads /data/backups

# Copy entrypoint
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENV SERVER_PORT=8080 \
    UPLOAD_DIR=/data/uploads \
    BACKUP_DIR=/data/backups \
    GIN_MODE=release

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${SERVER_PORT}/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
