# Find Nearest Restaurant

An API that helps tourists and residents find restaurants visible from their current location.
Every restaurant has a circular "reach" (radius); a restaurant is visible from a point if the
straight-line distance from that point to the restaurant is not greater than its radius.

Built with **Node.js, TypeScript and Fastify**, backed by **PostgreSQL** (via Prisma).

## Contents

- [Quick start](#quick-start)
- [Configuration](#configuration)
- [API](#api)
- [Database](#database)
- [Architecture & technical rationale](#architecture--technical-rationale)
- [Testing](#testing)
- [Docker](#docker)
- [CI](#ci)

## Quick start

Requirements: Node.js 20+, npm, and Docker (for PostgreSQL) — the database is not optional,
see [Database](#database).

```bash
npm install
cp .env.example .env              # then edit JWT_SECRET etc. for your environment

docker compose up -d db           # starts a local PostgreSQL
npm run db:migrate                # applies the schema
npm run db:seed                   # imports data/locations.json into it (optional, but handy)

npm run dev                       # starts the API on http://localhost:3000 with reload
```

Prefer not to install Node.js/npm at all? `docker compose up -d` runs the whole stack (database,
migrations, and the app itself) from just Docker - see [Docker](#docker).

Open `http://localhost:3000/docs` for interactive OpenAPI (Swagger) documentation.

Production build:

```bash
npm run build
npm start
```

Run the test suite:

```bash
npm test
```

### Try it end-to-end

```bash
# 1. Get a token (demo credentials are configured via env vars, see below)
curl -s -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin-secret"}'
# => { "access_token": "...", "token_type": "Bearer", "expires_in": "1h", "role": "admin" }

TOKEN="<paste access_token here>"

# 2. Add a restaurant (admin only)
curl -s -X PUT http://localhost:3000/locations/51e1545c-8b65-4d83-82f9-7fcad4a23111 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
        "name": "Da Jia Le",
        "type": "Restaurant",
        "id": "51e1545c-8b65-4d83-82f9-7fcad4a23111",
        "opening-hours": "10:00AM-11:00PM",
        "image": "https://tinyurl.com",
        "coordinates": "x=5,y=5",
        "radius": 3
      }'

# 3. Search for restaurants visible from (4, 4) - coordinates may be decimal, e.g. x=4.5&y=4
curl -s "http://localhost:3000/locations/search?x=4&y=4" -H "Authorization: Bearer $TOKEN"

# 4. Fetch its details
curl -s http://localhost:3000/locations/51e1545c-8b65-4d83-82f9-7fcad4a23111 -H "Authorization: Bearer $TOKEN"
```

## Configuration

All configuration is via environment variables (see `.env.example`), validated at startup with
a strict schema (`src/config/env.ts`) — the process refuses to start with missing/invalid config
rather than falling back to silently wrong defaults for security-sensitive values like
`JWT_SECRET`, or silently running without a database.

| Variable                       | Default                  | Purpose                                                    |
| ------------------------------- | ------------------------- | ------------------------------------------------------------ |
| `HOST`                          | `0.0.0.0`                 | Bind address                                                 |
| `PORT`                          | `3000`                    | Bind port                                                    |
| `LOG_LEVEL`                     | `info`                    | Pino log level                                                |
| `NODE_ENV`                      | `development`             | Enables pretty logging in `development`                       |
| `DATABASE_URL`                  | *(required)*              | PostgreSQL connection string — the only runtime datasource   |
| `JWT_SECRET`                    | *(required)*              | Signing secret for issued tokens                              |
| `JWT_EXPIRES_IN`                | `1h`                      | Token lifetime                                                |
| `DEMO_ADMIN_USERNAME/PASSWORD`  | `admin` / `admin-secret`  | Demo `admin` role credentials for `POST /auth/token`          |
| `DEMO_USER_USERNAME/PASSWORD`   | `user` / `user-secret`    | Demo `user` role credentials for `POST /auth/token`           |
| `WRITE_RATE_LIMIT_MAX`          | `20`                      | Max `PUT /locations/:id` requests per window per IP            |
| `WRITE_RATE_LIMIT_WINDOW`       | `1 minute`                | Window for the write rate limit                                |

## API

Interactive documentation (OpenAPI 3.0, generated from the same TypeBox schemas that validate
requests, so it can never drift from the implementation) is served at `GET /docs`, with the raw
document at `GET /docs/json`.

All endpoints below except `POST /auth/token` and `GET /health` require
`Authorization: Bearer <token>`.

### `POST /auth/token`

Issues a JWT carrying a `role` claim (`admin` or `user`), given demo credentials configured via
env vars (see [Configuration](#configuration)).

```
POST /auth/token
{ "username": "admin", "password": "admin-secret" }

200 OK
{ "access_token": "...", "token_type": "Bearer", "expires_in": "1h", "role": "admin" }
```

### `GET /locations/search?x=<number>&y=<number>`

_Requires role: `admin` or `user`._ Returns every restaurant whose circle covers `(x, y)`,
sorted by distance ascending. Coordinates may be decimal (e.g. `x=4.5`).

```
GET /locations/search?x=3&y=2

200 OK
{
  "user-location": "x=3,y=2",
  "locations": [
    { "id": "...", "name": "Deseado Steakhaus", "coordinates": "x=2,y=2", "distance": 1.0 },
    { "id": "...", "name": "Fire Tiger", "coordinates": "x=2,y=3", "distance": 1.41421 }
  ]
}
```

If nothing covers the point, `locations` is an empty array and a human-readable `message` is
included instead of leaving the client to guess why the list is empty:

```
GET /locations/search?x=9999999&y=9999999

200 OK
{
  "user-location": "x=9999999,y=9999999",
  "locations": [],
  "message": "No restaurants found near this location."
}
```

### `GET /locations/:id`

_Requires role: `admin` or `user`._ Returns restaurant details, or `404` if the id doesn't
exist. Matches the spec exactly - note `radius` is not part of this view (it's an internal
search parameter, not public-facing restaurant info).

```
GET /locations/51e1545c-8b65-4d83-82f9-7fcad4a23111

200 OK
{
  "name": "Da Jia Le",
  "type": "Restaurant",
  "id": "51e1545c-8b65-4d83-82f9-7fcad4a23111",
  "opening-hours": "10:00AM-11:00PM",
  "image": "https://tinyurl.com",
  "coordinates": "x=5,y=5"
}
```

### `PUT /locations/:id`

_Requires role: `admin`._ Rate limited (`WRITE_RATE_LIMIT_MAX` per `WRITE_RATE_LIMIT_WINDOW`,
`429` once exceeded). Creates the restaurant if `:id` is new (`201`), or replaces it if it
already exists (`200`) - an upsert by id, same semantics as the seed command below. The body's
`id`, if present, must match the path `:id` (`400` otherwise). Coordinates may be decimal.

```
PUT /locations/51e1545c-8b65-4d83-82f9-7fcad4a23111
{
  "name": "Da Jia Le",
  "type": "Restaurant",
  "id": "51e1545c-8b65-4d83-82f9-7fcad4a23111",
  "opening-hours": "10:00AM-11:00PM",
  "image": "https://tinyurl.com",
  "coordinates": "x=5,y=5",
  "radius": 3
}
```

### `GET /health`

Unauthenticated liveness/readiness probe for load balancers / container orchestrators. Actually
checks database connectivity (`SELECT 1`) rather than always reporting healthy - a healthy
process that can't reach Postgres is not actually able to serve traffic:

```
200 OK  { "status": "ok" }
503     { "status": "error", "message": "Database unreachable" }
```

## Database

**PostgreSQL is the only runtime datasource.** The app refuses to start without a working
`DATABASE_URL` - there is no in-memory or file-backed fallback mode. JSON files under `data/`
are seed/import input only, loaded exclusively by the explicit `npm run db:seed` command below;
nothing in `app.ts`/`server.ts` ever reads them, so nothing auto-imports on startup.

```bash
# 1. Start a local Postgres (postgres:16-alpine, see docker-compose.yml)
docker compose up -d db

# 2. Point the app at it (already the default in .env.example) and apply the schema
npm run db:migrate        # applies prisma/migrations (safe to re-run)

# 3. Seed/import from a JSON file - upserts by id, so re-running updates existing rows
npm run db:seed                              # imports ./data/locations.json
npm run db:seed -- ./data/locations_big.json # imports an arbitrary file instead

# 4. Run the app
npm run dev
```

The JSON file format (same for both `data/locations.json` and `data/locations_big.json`) is a
single object with a `locations` array:

```json
{
  "locations": [
    {
      "id": "51e1545c-8b65-4d83-82f9-7fcad4a23111",
      "name": "Da Jia Le",
      "type": "Restaurant",
      "opening-hours": "10:00AM-11:00PM",
      "image": "https://tinyurl.com",
      "coordinates": "x=5,y=5",
      "radius": 3
    }
  ]
}
```

Other useful commands:

- `npm run db:migrate:dev` — create a new migration from schema changes during development
  (`prisma/schema.prisma` is the source of truth; hand-edit it, then run this to generate SQL).
- `npm run db:studio` — Prisma Studio, a local GUI for inspecting the `restaurants` table.

### Swapping PostgreSQL for another RDBMS

`PrismaLocationsRepository` (the only runtime repository) is written entirely against Prisma's
query builder (`findMany`/`upsert`/`aggregate`) - it never drops to raw SQL. Swapping the
underlying database (e.g. to MySQL or SQL Server) touches exactly two things:

1. `prisma/schema.prisma` - change `datasource.provider`, and any `@db.X` native-type
   annotations if the new engine needs different ones.
2. A fresh migration for that engine's SQL dialect (migrations are inherently
   engine-specific in any tool, Prisma included - `prisma migrate dev` generates one for you
   once the datasource above points at the new engine).

`PrismaLocationsRepository`, `LocationsService`, the controllers, and the mapper are all
unaffected - none of them know or care which RDBMS is behind Prisma. This is also why
`candidatesNear`'s bounding-box filter (see [Architecture](#architecture--technical-rationale))
uses plain numeric `gte`/`lte` comparisons instead of a Postgres-only extension like PostGIS -
that would have broken this portability story for a marginal gain.

## Architecture & technical rationale

```
src/
  app.ts                   Fastify instance assembly (plugins + routes wiring)
  server.ts                Process entrypoint (env loading, listen, graceful shutdown)
  config/env.ts             Startup-time env validation (TypeBox)
  db/prisma-client.ts       Shared Prisma client singleton
  plugins/                  Cross-cutting concerns: auth, rate-limit, swagger, error handling
  modules/
    auth/                   controller -> service (routes bind schema + controller)
    locations/              controller -> service -> repository (port + Prisma adapter) -> mapper
  utils/                    Pure helpers (distance, coordinate string parsing)
```

- **Layered modules: controller → service → repository → mapper, plus schema.** Each feature
  module separates concerns into `controller` (framework-agnostic request handling: plain
  validated data in, plain response data out - no Fastify types), `service` (business rules),
  `repository` (data access, behind a port interface), `mapper` (every domain ↔ wire-shape
  conversion, in one place instead of scattered), and `schema` (TypeBox validation/OpenAPI).
  `routes` files are now intentionally thin: they just bind a path + schema + security/rate-limit
  config to a controller method, adapting Fastify's `request`/`reply` into plain arguments. This
  means controllers are unit-testable with plain objects, no Fastify request/reply mocking
  required - see how `locations.service.test.ts` never imports anything from `fastify`.

- **Fastify + TypeBox + `@fastify/type-provider-typebox`** for schemas. One schema object per
  route drives three things at once: runtime request validation (via Fastify's built-in Ajv),
  static TypeScript types for the handler, and the OpenAPI document served at `/docs`. This was
  chosen over e.g. `zod` because it is Fastify's native, first-class schema format — no adapter
  layer, and validation happens in Fastify's own request lifecycle rather than bolted on
  afterward.

- **PostgreSQL is the only runtime datasource, behind a repository interface.**
  `LocationsService` and the controllers depend only on `LocationsRepositoryPort` (`getAll`,
  `getById`, `candidatesNear`, `upsert` — see `locations.repository.types.ts`), never on Prisma
  or Postgres directly. The port still earns its keep with a single concrete adapter
  (`PrismaLocationsRepository`): it's what lets `LocationsService`'s business logic
  (distance filtering, sorting, not-found/id-mismatch errors) be unit-tested against an
  in-memory fake with zero database (`test/locations.service.test.ts`), and what keeps a future
  RDBMS or ORM swap from rippling into the service/controller layers - see
  [Swapping PostgreSQL for another RDBMS](#swapping-postgresql-for-another-rdbms).

- **The search algorithm lives entirely in the database now.** `candidatesNear` bounds its scan
  to a box sized by the largest radius currently in the dataset (`x`/`y` within `±maxRadius` of
  the query point), so the `@@index([x, y])` on the `restaurants` table prunes the range scan
  instead of a full table scan - cost scales with *local density* around the query point, not
  with total dataset size, which is what lets this stay fast whether there are 4 restaurants or
  4 million. `LocationsService` still applies the exact `distance <= radius` check and sort on
  the resulting superset. Deliberately plain numeric predicates, not PostGIS - see
  [Swapping PostgreSQL for another RDBMS](#swapping-postgresql-for-another-rdbms) for why.

- **Coordinates are floats, not integers.** `x`/`y` are `Float` in the schema (Postgres
  `DOUBLE PRECISION`) and `Type.Number` in the API schemas, since a system meant to handle
  "millions of data points" shouldn't force every location onto an integer grid. `radius` stays
  an integer (not requested to change, and the original spec used integer radii).

- **JWT auth with a role claim, applied per-route.** `POST /auth/token` issues a signed JWT
  (`@fastify/jwt`) carrying `{ username, role }`. Two Fastify decorators, `authenticate` and
  `requireRole(...roles)`, are attached as `onRequest` hooks per-route rather than globally —
  this keeps the required role for every endpoint visible right next to its schema (and thus in
  the generated OpenAPI `security` field), instead of relying on an implicit global default that
  someone has to remember to opt an endpoint out of. `search` and the detail endpoint accept
  either role; `PUT` requires `admin`.

- **Rate limiting only where it matters.** A generous global limit (`@fastify/rate-limit`,
  300 req/min) is a baseline guard against runaway clients; the write endpoint additionally
  layers a much stricter, configurable limit (`WRITE_RATE_LIMIT_MAX` / `_WINDOW`) via Fastify's
  route-level `config.rateLimit`, since that's the endpoint that mutates shared state.

- **Centralized error handling.** Domain errors (`RestaurantNotFoundError`,
  `RestaurantIdMismatchError`, `InvalidCredentialsError`) are plain typed classes thrown from
  services; a single `setErrorHandler` in `plugins/error-handler.ts` maps them to the right HTTP
  status, alongside Fastify's own schema-validation and rate-limit errors. Handlers stay free of
  `try/catch`-and-status-code boilerplate, and every error response has a consistent shape
  (`{ statusCode, error, message }`).

- **A health check that actually checks something.** `GET /health` pings the database
  (`SELECT 1`) rather than unconditionally returning healthy - a process that's up but can't
  reach Postgres would otherwise report healthy to an orchestrator's liveness/readiness probe
  right up until the first request fails.

- **Structured logging (Pino, built into Fastify)**, pretty-printed only in development;
  unexpected (5xx) errors are logged server-side with full detail but returned to clients as a
  generic message, avoiding leaking internals.

- **Graceful shutdown** (`close-with-grace`) so in-flight requests finish and the Prisma
  connection closes cleanly before the process exits, e.g. during container rolling deploys.

## Testing

```bash
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # with coverage
```

Tests use [Vitest](https://vitest.dev/) and are organized by layer:

- `test/utils/*` — pure helper unit tests (distance, coordinate parsing, including decimals).
- `test/locations.service.test.ts` — business rules, against an in-memory fake implementing
  `LocationsRepositoryPort` (no database) - the exact worked example from the spec (restaurants
  at `(1,1) r1`, `(2,2) r2`, `(5,5) r1`, `(2,3) r5`, user at `(3,2)`), plus decimal coordinates
  and the empty-result message.
- `test/locations.repository.test.ts` — `PrismaLocationsRepository` against a real Postgres:
  loading, the bounding-box search, upsert-by-id, float coordinates.
- `test/app.integration.test.ts` — full HTTP surface via Fastify's `inject()`: auth, role
  enforcement, validation errors, rate limiting, the generated OpenAPI document, and the
  database-backed health check.

The last two need a real database, so they're skipped automatically unless `DATABASE_URL` is
set (`describe.skipIf`) - `npm test` never needs Docker running to give you *some* signal, but
the full suite only runs with Postgres up:

```bash
docker compose up -d db && npm run db:migrate
npm test   # DATABASE_URL from .env is picked up automatically; the full suite runs
```

CI always provides a Postgres service container (see [CI](#ci)), so the full suite always runs
there regardless of local setup.

Both DB-backed test files track the ids they create (`ownedIds`) and scope every cleanup query
to exactly those ids - never a table-wide delete. `DATABASE_URL` can safely point at a database
that also holds real seeded data (e.g. your local dev DB); running the tests won't touch it.
For the same reason, assertions against `GET /locations/search` filter results down to each
test's own fixtures before checking exact contents/order, since a shared database may
legitimately have other restaurants near the same coordinates.

## Docker

The whole stack (database + app, with migrations applied automatically in between) runs from
one file - this is the easiest way for someone else to get an identical environment running
with no local Node.js/npm setup at all, only Docker:

```bash
cp .env.example .env       # first time only
docker compose up -d       # db -> migrate (runs once, then exits) -> app
curl http://localhost:3000/health
```

`docker compose ps` should show `db` and `app` both healthy, and a `migrate` container that ran
and exited with code 0 (that's expected - it's a one-off job, not a long-running service).
Seeding stays a deliberate, separate step, matching `npm run db:seed`'s own "never automatic"
behavior - it's defined but not started by `up` (profile-gated):

```bash
docker compose run --rm seed                                    # imports data/locations.json
docker compose run --rm seed npm run db:seed -- ./data/locations_big.json  # or another file
```

Tear down (keeps the `db-data` volume, so restarting doesn't lose data): `docker compose down`.
Wipe everything including the database volume: `docker compose down -v`.

### Just the image

```bash
docker build -t find-nearest-restaurant .
docker run -p 3000:3000 --env-file .env find-nearest-restaurant
```

Multi-stage build: dependencies and the TypeScript build happen in throwaway stages; the final
image only contains production `node_modules` (plus the Prisma-generated client, copied from
the build stage since generating it needs the `prisma` CLI, a devDependency), compiled `dist/`,
and `data/` (in case you want to run `db:seed` from inside the container), running as a non-root
user. `docker-compose.yml`'s `migrate`/`seed` services instead build the intermediate `build`
stage directly (`target: build`), since running `prisma migrate deploy`/the seed script needs
the `prisma` CLI and `tsx`, both devDependencies deliberately excluded from the slim runtime
image.

Migrations are not run automatically inside the `app` service itself on boot, so a schema
change can't surprise a running fleet - `docker-compose.yml` instead runs them via the separate
`migrate` service, gated with `depends_on: condition: service_completed_successfully` so `app`
only starts after they've applied cleanly.

One gotcha this project hit and fixed: `docker-compose.yml`'s `app` service uses `env_file: .env`
for convenience, but `.env`'s `NODE_ENV=development` (correct for `npm run dev` on the host) would
otherwise leak into the container and make Fastify try to load `pino-pretty` for log formatting -
a devDependency not present in the slim runtime image, crashing the server on boot. The compose
file explicitly overrides `NODE_ENV: production` (alongside `DATABASE_URL`, which also needs
overriding - inside the compose network Postgres is reachable at the `db` hostname, not
`localhost`) for exactly this reason.

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`, against Node 20.x and 22.x: install,
lint, format check, type check, apply Postgres migrations, test (with coverage, against a
`postgres:16-alpine` service container), build.
