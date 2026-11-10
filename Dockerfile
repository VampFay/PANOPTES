# Multi-stage non-root OCI Dockerfile for PANOPTES sidecar
FROM oven/bun:1-alpine AS builder

WORKDIR /build
COPY panoptes/package.json ./
RUN bun install --frozen-lockfile || bun install

COPY panoptes/ ./
# Run typecheck and bundle build
RUN bun run typecheck

FROM oven/bun:1-alpine AS runner

WORKDIR /app

# Harden container: non-root user
USER bun

COPY --from=builder --chown=bun:bun /build /app

ENV NODE_ENV=production \
    PANOPTES_HOST=0.0.0.0 \
    PANOPTES_PORT=8787 \
    PANOPTES_POLICY=examples/policies/bench.json

EXPOSE 8787

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1

ENTRYPOINT ["bun", "run", "src/cli.ts", "serve"]
CMD ["--host", "0.0.0.0", "--port", "8787"]
