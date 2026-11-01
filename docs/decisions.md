# Decisions

Short architecture decision records: the choice, why, and what was given up.

## 1. One Next.js app with Server Actions (no separate API)

Mutations are Server Actions, typed end to end and validated with Zod; Route Handlers exist only for file downloads (export, `.ics`). A single deployable keeps the project simple for one user. Trade-off: no public API for other clients — not needed.

## 2. Drizzle rather than Prisma

Drizzle stays close to SQL (queries are readable in reviews and interviews), is light in serverless functions, and generates plain SQL migration files that are committed and reviewed. Prisma offers more tooling but adds an engine and hides the SQL.

## 3. Owner-only authentication, hand-rolled

There is exactly one user and no sign-up. A small, fully tested module (argon2id, database sessions, hashed tokens, rate limiting) is easier to reason about than configuring a general auth library to disable most of its features. Trade-off: no OAuth or passkeys yet.

## 4. History is a snapshot, the plan is versioned

Each workout stores a frozen copy of what was planned; each import or edit creates a new program version. Editing the plan can therefore never rewrite the past, and old workouts still show what was prescribed then.

## 5. The calendar stores exceptions, not every day

By default a date follows its weekday's program day. Only moves and Saturday choices are stored (one row per date). Exceptions are re-mapped to new program versions by weekday and option number, so planning survives an import.

## 6. Parse the file twice, never trust the preview

The preview and the save both receive the file and parse it on the server. The browser never sends a program to save on import, so what is stored is exactly what the parser produced from the bytes.

## 7. Missing is not zero

Weights are nullable everywhere. Volume only sums sets with both weight and reps; charts show gaps; consistency is "—" before anything was planned. A bodyweight set is not a 0 kg set.

## 8. Weights stored in kilograms

The kg/lb setting only changes display and typing. Conversions are pure functions with tested round-trips (45 lb → 20.41 kg → 45 lb).

## 9. Offline-tolerant logging without a service worker

The workout screen queues changes in `localStorage` and retries; the server is idempotent (upsert per set, idempotency keys for start/finish). This covers the real problem (gym network) with far less complexity than a full offline app. A service worker remains a future improvement.

## 10. Tests against real PostgreSQL semantics

Integration tests run the real migrations on PGlite (PostgreSQL compiled to WebAssembly): constraints, partial indexes and generated columns are exercised without Docker. E2E runs on a real PostgreSQL server against a production build.
