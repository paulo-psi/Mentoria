# Hub de Mentorias

Relação restrita das equipes, mentores e estudantes do PIBEP PUCPR 2026.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server on the configured `PORT`
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Auth keys are provisioned automatically by Replit-managed Clerk. To approve the first access, add `HUB_ALLOWED_EMAILS` in the workspace **Secrets** pane (shared environment) with verified e-mail addresses separated by commas. Restart the API after changes. Do not put the list in source code, frontend variables or this document.
- If `HUB_ALLOWED_EMAILS` is absent or empty, the people-list API remains closed even to signed-in users. A new Clerk account is not approved automatically. Development and published Clerk accounts are separate; an approved person must register/sign in again after publishing.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild

## Where things live

- `lib/db/src/schema/` — Drizzle tables and strict `drizzle-zod` insert schemas
- `lib/api-spec/openapi.yaml` — API contract; regenerate clients after changes
- `artifacts/api-server/src/seed.ts` — official PIBEP 2026 data, seeded at API startup only in an empty database
- `artifacts/api-server/src/routes/` — health and teams endpoints
- `artifacts/hub-mentorias/src/` — public landing, login and protected React portal

## Architecture decisions

- The original PRD requested npm and `shared/schema.ts` / `server/seed.ts`. This project was provisioned as a pnpm monorepo; the equivalent implementations follow its existing `lib/db` and `artifacts/api-server` conventions. Do not add a second package manager or parallel schema.
- Seed inserts are transactional and guarded by an advisory lock. A nonempty table causes the seed to skip rather than overwrite or repair potentially user-owned data.
- Database checks mirror Zod's score/type restrictions so future writes cannot bypass the accepted ranges.
- Only authenticated people with a verified primary e-mail in the server-side approval list may read `GET /api/teams`. Do not replace this with frontend-only gating or grant the first account access automatically.

## Product

- `GET /api/health` checks the database and returns `{ "status": "ok", "database": "connected" }` when healthy.
- `GET /api/teams` returns teams, mentor names and students only after the server approves the session.
- The root preview is a public introduction with no names. Signed-in users land in `/user-portal`, where unapproved people see an access-pending message.

## User preferences

- Do not add the final analytics dashboard, dossier drawer, or mentoring forms as part of this access-control milestone.

## Gotchas

- Apply `pnpm --filter @workspace/db run push` in development before starting the API on a fresh database, because startup seed expects the tables to exist.
- Keep transaction queries sequential on the same `pg` client.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
