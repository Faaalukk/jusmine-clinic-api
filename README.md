# jusmine-clinic-api

Backend for the Clinic Source Tracking system: a shared iPad survey asking customers which branch they visited and how they discovered the clinic, plus a manager dashboard.

Stack: [Bun](https://bun.sh) · [Elysia](https://elysiajs.com) · [Drizzle ORM](https://orm.drizzle.team) · PostgreSQL.

The frontend lives in the separate `jusmine-clinic-web` repository.

## Getting started

```bash
bun install
cp .env.example .env          # then set JWT_SECRET and the two account passwords
docker compose up -d --wait   # Postgres on localhost:5434
bun run db:migrate
bun run db:seed               # default branches + discovery sources (only if tables are empty)
bun run db:seed:demo          # optional: also ~20 months of fake responses for the dashboard
bun run dev                   # http://localhost:3000
```

## Accounts

The hand-off defines exactly two shared accounts, so there is no user table. Credentials come from env vars:

| Role     | Env vars                                   | Can                                     |
| -------- | ------------------------------------------ | --------------------------------------- |
| Employee | `EMPLOYEE_USERNAME`, `EMPLOYEE_PASSWORD`   | Load the survey and submit responses    |
| Manager  | `MANAGER_USERNAME`, `MANAGER_PASSWORD`     | Everything, including reports and admin |

Login returns a JWT (employee: 30 days so the shared iPad stays signed in, manager: 7 days). Send it as `Authorization: Bearer <token>`. Changing `JWT_SECRET` signs everyone out.

## API

| Method | Path                  | Role    | Notes                                                                 |
| ------ | --------------------- | ------- | --------------------------------------------------------------------- |
| POST   | `/auth/login`         | —       | `{ username, password }` → `{ token, role }`                          |
| GET    | `/auth/me`            | any     | `{ role }`                                                            |
| GET    | `/survey/options`     | any     | Active branches and sources, in display order                         |
| POST   | `/survey/responses`   | any     | `{ branchId, sourceIds[] }`, at least one source                      |
| GET    | `/branches`           | manager | All branches with `responseCount`                                     |
| POST   | `/branches`           | manager | `{ name, active? }`                                                   |
| PATCH  | `/branches/:id`       | manager | `{ name?, active? }`                                                  |
| GET    | `/sources`            | manager | All sources with `selectionCount`                                     |
| POST   | `/sources`            | manager | `{ name, icon, active? }`, inserted before the "Other" source          |
| PATCH  | `/sources/:id`        | manager | `{ name?, icon?, active? }`                                           |
| PUT    | `/sources/order`      | manager | `{ ids[] }`, every source id in the new order                         |
| GET    | `/reports/dashboard`  | manager | `?range=today\|month\|year\|custom&from&to&branch=all\|<id>`          |

Error bodies are `{ error: "<code>" }`, e.g. `invalid_credentials`, `name_taken`, `last_active`, `invalid_branch`.

Business rules from the hand-off:

- Branches and sources are never deleted, only deactivated, so historical reports stay intact.
- The last active branch or source cannot be deactivated (the survey would be empty).
- Names are unique per table, case-insensitively.
- No customer personal data is stored: a response is only a branch, a timestamp and the chosen sources.

## Reports

`/reports/dashboard` returns totals, the previous comparable period, per-source counts, a trend series and a branch × source matrix. It returns raw counts, so the frontend can show either "% of selections" or "% of respondents" (the hand-off leaves this open).

"Today", "this month", chart buckets and so on use `APP_TIMEZONE` (default `Asia/Bangkok`).

## Scripts

| Script                | What it does                                   |
| --------------------- | ---------------------------------------------- |
| `bun run dev`         | Start with watch mode                          |
| `bun run start`       | Start                                          |
| `bun test`            | Unit tests                                     |
| `bun run typecheck`   | `tsc --noEmit`                                 |
| `bun run db:generate` | Generate a migration after editing the schema  |
| `bun run db:migrate`  | Apply migrations                               |
