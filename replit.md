# Hub de Mentorias

Base de gestão de mentorias para equipes de startups, com mentores principais, sessões e uma tela provisória de conexão/listagem.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — start API and seed an empty development database
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — Drizzle tables and strict `drizzle-zod` insert schemas
- `lib/api-spec/openapi.yaml` — API contract; regenerate clients after changes
- `artifacts/api-server/src/seed.ts` — initial sample data, run at API startup only when all three tables are empty
- `artifacts/api-server/src/routes/` — health and teams endpoints
- `artifacts/hub-mentorias/src/` — provisional React page

## Architecture decisions

- The original PRD requested npm and `shared/schema.ts` / `server/seed.ts`. This project was provisioned as a pnpm monorepo; the equivalent implementations follow its existing `lib/db` and `artifacts/api-server` conventions. Do not add a second package manager or parallel schema.
- Seed inserts are transactional and guarded by an advisory lock. A nonempty table causes the seed to skip rather than overwrite or repair potentially user-owned data.
- Database checks mirror Zod's score/type restrictions so future writes cannot bypass the accepted ranges.

## Product

- `GET /api/health` checks the database and returns `{ "status": "ok", "database": "connected" }` when healthy.
- `GET /api/teams` returns teams with lead mentors and session counts.
- The root preview shows a connection badge and team listing. Forms, authentication and analytics dashboard are intentionally outside this first milestone.

## User preferences

- The first milestone is intentionally limited to a provisional screen; do not add the final analytics dashboard, dossier drawer, mentoring forms, or authentication here.

## Gotchas

- Apply `pnpm --filter @workspace/db run push` in development before starting the API on a fresh database, because startup seed expects the tables to exist.
- Keep transaction queries sequential on the same `pg` client.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
