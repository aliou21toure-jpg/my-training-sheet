# My Training Sheet

A private, single-user workout tracker that turns an Excel training program into a polished, iPhone-first app: see today's workout, log every set in the gym (even offline), reschedule the week, and follow progress over time.

**Live app:** [training.sadiatoure.dev](https://training.sadiatoure.dev) (private, owner sign-in only).

<p align="center">
  <img src="docs/screenshots/today-light.png" width="200" alt="Today screen" />
  <img src="docs/screenshots/workout-light.png" width="200" alt="Workout logging screen" />
  <img src="docs/screenshots/progress-light.png" width="200" alt="Progress charts" />
  <img src="docs/screenshots/progress-dark.png" width="200" alt="Progress in dark mode" />
</p>

> Screenshots use **synthetic demo data** (`pnpm demo:seed`). The repository contains no personal training data.

## Why this project

The program lived in a spreadsheet with eight hand-written sheets: free-text sections, rep ranges like `2 x 8-10 (Failure)`, rests written `1min30`, circuits described in a sentence, three alternative Saturday workouts. The goal was a real app used every week, not a static prototype, and a portfolio piece showing frontend, backend, database design, testing and deployment.

## Features

- **Excel import** — reads the workbook in memory, parses every notation into structured data, keeps the original text of each cell, flags what it cannot read instead of guessing, previews before saving, refuses duplicate files.
- **Today** — date, greeting, the day's workout (strength, Saturday choice, recovery with step target, rest), week strip, upcoming days, resume an unfinished session.
- **Workout logging** — weight × reps or duration per set, previous performance per set, rest timer (±15 s, vibration), session clock excluding pauses, extra sets, skippable optional sections, notes, completion summary with volume and new records.
- **Gym-proof saving** — every change is queued, mirrored in `localStorage` and sent in order; it survives network loss and page refreshes; the server side is idempotent.
- **Calendar** — week and month views; move a workout by swapping two future days; choose the Saturday option in advance; past days are read-only.
- **Progress** — completed sessions, consistency vs the plan, active weeks, per-exercise charts (weight, reps or duration), weekly bars, all-time records and recent achievements. Missing values are gaps, never zeros.
- **Program editor** — edit days, exercises, order, sets, reps, rest, optional sections, alternatives and Saturday options; every save is a new version, so history never changes.
- **Settings** — light / dark / system theme, kg / lb (storage stays in kg), time zone, reminders as an `.ics` file with alarms, JSON and CSV export, erase with typed confirmation.
- **Private by design** — one owner account, no sign-up, argon2id passwords, hashed session tokens, rate-limited sign-in, every page and Server Action checks the session.

## Tech stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router, Server Components, Server Actions, Cache Components), React 19, TypeScript strict |
| UI | Tailwind CSS 4, Lucide icons, Recharts; system font stack, original design system |
| Data | PostgreSQL, Drizzle ORM + versioned SQL migrations, Zod validation |
| Auth | Hand-rolled owner-only sessions: argon2id (`@node-rs/argon2`), httpOnly cookie, DB sessions |
| Import | ExcelJS (server only) |
| Tests | Vitest (unit + integration on PGlite), Playwright (E2E on PostgreSQL), axe-core accessibility audits |
| CI / Deploy | GitHub Actions; Vercel + managed PostgreSQL (Neon) |

## Architecture

```mermaid
flowchart LR
  subgraph Browser["iPhone / Mac browser"]
    UI["React client components"]
    Q["Save queue (localStorage)"]
  end
  subgraph Next["Next.js server"]
    P["proxy.ts<br/>(optimistic redirect)"]
    RSC["Server Components<br/>(pages)"]
    SA["Server Actions<br/>(requireOwner + Zod)"]
    F["features/*<br/>pure business logic"]
  end
  DB[("PostgreSQL")]
  UI --> P --> RSC --> F
  UI --> Q --> SA --> F
  F --> DB
```

Business rules live in `src/features/*` as functions that take the database as a parameter. Pages and Server Actions are thin: check the session, validate input, call a feature, render. The same functions run against PGlite (PostgreSQL in memory) in tests. More in [docs/architecture.md](docs/architecture.md) and [docs/decisions.md](docs/decisions.md).

## Project structure

```
src/
  app/                  routes: (auth)/sign-in, (app)/{today,workout,calendar,progress,settings}, api/
  components/           UI only, fed by props
  features/             import, workouts, schedule, calendar, progress, program, settings, auth
  db/schema/            Drizzle tables (14) — drizzle/ holds the generated SQL migrations
  lib/                  auth (cookie, current owner), dates (time zones), units (kg/lb)
  proxy.ts              optimistic sign-in redirect (Next 16 name for middleware)
tests/
  unit/                 parsers, formatters, dates
  integration/          features against a real migrated PostgreSQL (PGlite)
  e2e/                  Playwright journeys, security and accessibility
  fixtures/             synthetic workbook built in memory (no binary, no personal data)
scripts/                create the owner, seed demo data
docs/                   architecture, decisions, deployment, screenshots
```

## Getting started (macOS)

Prerequisites: Node 22 LTS, pnpm (`corepack enable`), Docker Desktop.

```bash
pnpm install
cp .env.example .env.local
docker compose up -d                 # PostgreSQL 17 on localhost:5432
pnpm db:migrate                      # apply the SQL migrations
pnpm owner:create you@example.com "First name"   # asks for a password (12+ chars)
pnpm dev                             # http://localhost:3000
```

Optional demo data on an **empty** database: `pnpm demo:seed -- --yes-this-is-a-demo-database` (owner `demo@example.com` / `demo-password-1234`).

To use it on an iPhone on the same Wi-Fi: `pnpm dev -H 0.0.0.0`, open `http://<your-mac-ip>:3000`, then *Share → Add to Home Screen*.

## Testing

```bash
pnpm lint
pnpm typecheck
pnpm test        # 214 unit + integration tests (no database needed: PGlite)
pnpm test:e2e    # Playwright on a production build; needs E2E_DATABASE_URL (it WIPES that database)
```

E2E example with Docker: `docker compose exec db createdb -U mts my_training_sheet_e2e`, then `E2E_DATABASE_URL=postgres://mts:mts@localhost:5432/my_training_sheet_e2e pnpm test:e2e`.

What is covered: every spreadsheet notation, parser edge cases, import/save/versioning/rollback, sessions and lockout, schedule swaps and options, workout start/resume/idempotency/finish, records, progress maths, settings, export, erase; end-to-end journeys (import → Saturday option, sign-in → workout → summary → progress, settings, editor), security checks, and an axe WCAG 2.1 AA audit on every screen in light and dark mode.

## Database migrations

Schema changes are made in `src/db/schema/*`, then:

```bash
pnpm db:generate --name what_changed   # writes drizzle/NNNN_what_changed.sql — review it
pnpm db:migrate
```

## Deployment

The app is meant to be deployed privately (Vercel + Neon). Step-by-step guide: [docs/deployment.md](docs/deployment.md). The build needs no secret; at runtime the only required variable is `DATABASE_URL`.

## Privacy

- The original spreadsheet and any real workout data are never committed (`.gitignore` blocks `*.xlsx`, `*.csv`, `.env*`).
- Tests and screenshots use a synthetic workbook generated in memory and fake demo workouts.
- Exports contain what the owner entered — never the password hash or session tokens.

## Known limitations

- Single owner by design: no sign-up, no password reset flow (re-run `owner:create` after deleting the row, or update the hash manually).
- Offline mode covers logging during a workout (queued sets); opening the app with no network at all is not supported (no service worker yet).
- Reminders are a calendar file (next 4 weeks) to download again after rescheduling, not push notifications.
- The Excel parser targets this program's layout family (title rows, `Exercise / Sets x Reps / Rest` tables, free-text sections); unknown layouts are flagged for review, not guessed.
- Rate limiting keys on `x-forwarded-for`, which is reliable behind Vercel; on other hosts configure the proxy accordingly.

## Future improvements

- Installable PWA with a service worker for full offline use.
- Apple Health export of workouts.
- Plate calculator and suggested next load from the progressive-overload rule.
- Passkey sign-in.

## License

Source code: MIT. No personal data is included in this repository.
