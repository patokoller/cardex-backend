# Cardex Backend — Production MVP

> The operating system for trading card collectors in LatAm. Starting with Pokémon TCG in Buenos Aires AMBA.

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | NestJS + Fastify | Typed modules, DI, Fastify for performance |
| ORM | Prisma | Type-safe schema, migrations, relations |
| Database | PostgreSQL 15 + PostGIS | Geo queries (vecino badge), full-text search |
| Auth | JWT (15m access + 30d refresh) | Stateless, scalable, bcrypt hashed refresh tokens |
| Rate limiting | @nestjs/throttler | Per-IP pre-auth, per-user post-auth |
| Validation | class-validator + class-transformer | DTO-level, whitelist-stripped |

## Quick Start

```bash
# 1. Clone and install
cp .env.example .env     # fill in your values
npm install

# 2. Start PostgreSQL with PostGIS
docker run -d \
  --name cardex-postgres \
  -e POSTGRES_DB=cardex \
  -e POSTGRES_USER=cardex \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgis/postgis:15-3.4

# 3. Generate Prisma client + run migrations
npm run prisma:generate
npm run prisma:migrate:dev -- --name init

# 4. Run custom SQL migration (PostGIS indexes, triggers)
psql $DATABASE_URL -f prisma/migrations/0001_extensions_and_indexes.sql

# 5. Seed the database (Sprint 0 card catalog + Anchor 30 users)
npm run prisma:seed

# 6. Start dev server
npm run start:dev
# → http://localhost:3000/v1
# → http://localhost:3000/docs (Swagger)
```

## Architecture

```
src/
├── main.ts                    # Fastify bootstrap, global middleware
├── app.module.ts              # Root module — all feature modules wired here
│
├── prisma/                    # Global DB access
│   ├── prisma.module.ts
│   └── prisma.service.ts      # Extends PrismaClient + PostGIS raw query helpers
│
├── common/
│   ├── decorators/
│   │   ├── current-user.decorator.ts   # @CurrentUser() param decorator
│   │   └── public.decorator.ts         # @Public() — skips JWT guard
│   ├── filters/
│   │   └── http-exception.filter.ts    # {data, error} envelope on all errors
│   ├── interceptors/
│   │   └── response.interceptor.ts     # {data, error: null} on all 2xx
│   ├── pipes/
│   │   └── pagination.dto.ts           # Reusable cursor pagination
│   └── config/
│       └── env.validation.ts           # Fails fast on missing env vars
│
├── auth/                      # JWT auth — register, login, refresh, logout
├── users/                     # Profiles, location, push devices, rep history
├── cards/                     # Catalog search (pg_trgm), card detail, demand
├── collection/                # Binder, add card (<8s hard limit), duplicates
├── wishlist/                  # 20-card free tier, priority, max cash bridge
├── trades/                    # The core: matches, offers, counter, confirm
├── marketplace/               # Cash marketplace — GATED until Month 4
├── pricing/                   # Oracle: blended internal + scraped prices
├── trust/                     # Rep, Vecino, Conocido graph, Primera Oferta
└── notifications/             # DB notifications + push dispatch stubs
```

## API Response Envelope

Every response — success and error — uses the same envelope:

```json
// Success
{ "data": { ... }, "error": null }

// Error
{ "data": null, "error": { "statusCode": 400, "message": "...", "timestamp": "..." } }
```

## Key Business Rules Encoded

| Rule | Location |
|---|---|
| Card scan hard limit (8s) | `collection.service.ts:addCard` — server-side telemetry |
| Wishlist free tier (20 cards) | `wishlist.service.ts:addItem` — throws 400 at limit |
| Offer window (2 hours) | `trades.service.ts:createOffer` — sets `expires_at` |
| Match score weights (60/20/12/8) | `trades.service.ts:computeMatchScore` |
| Marketplace MVP gate | `marketplace.service.ts:assertNotMvp` |
| Rep tier thresholds (200/500/800) | `trust.service.ts:TIER_THRESHOLDS` |
| P2P trades fee-free forever | No fee applied anywhere in trade flow |
| Cash marketplace 4% fee | `marketplace.service.ts` — Month 4 only |

## Security Checklist

- [x] JWT access tokens expire in 15 minutes
- [x] Refresh tokens hashed with bcrypt before storage (never stored raw)
- [x] Global `JwtAuthGuard` — all routes protected by default
- [x] `@Public()` decorator for explicit opt-out (register, login, public profiles)
- [x] `ValidationPipe` with `whitelist: true` — unknown properties stripped
- [x] Rate limiting on all routes — stricter on register/login
- [x] Password hashed with bcrypt (12 rounds)
- [x] Phone numbers stored as SHA-256 hash only
- [x] SQL injection: all user input via Prisma parameterized queries
- [x] Raw queries use `$queryRaw` tagged templates (not `$queryRawUnsafe` for user data)

## Scaling Triggers (from blueprint)

| When | Action |
|---|---|
| Matching queue depth > 500 jobs/run | Extract matching engine to separate worker |
| Price scraping jobs timeout main process | Extract pricing oracle to separate service |
| 5k+ users | Redis pub/sub for real-time trade events |
| 20k+ users | Multi-hop graph matching (Neo4j or PG recursive CTEs) |
| Need horizontal scale or compliance docs | Migrate from Railway to AWS ECS |

## Environment Variables

See `.env.example` for all required variables. The app **refuses to start** if `DATABASE_URL`, `JWT_ACCESS_SECRET`, or `JWT_REFRESH_SECRET` are missing.

## Deployment (Railway)

```bash
# One Fastify service + managed PostgreSQL + Redis on Railway
# $50–100/month for MVP volume

# Add PostGIS to Railway Postgres:
railway run psql -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Deploy
railway up
```
