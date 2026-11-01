# Private deployment (Vercel + Neon)

Goal: an HTTPS URL usable from the iPhone and the Mac, with a private managed PostgreSQL. Both services have free tiers that fit one user.

## 1. Database (Neon)

1. Create a project at neon.tech, region close to you (e.g. *Frankfurt* for France).
2. Copy the **pooled** connection string (`…-pooler…`, ends with `?sslmode=require`).
3. From your Mac, apply the migrations and create your account:

```bash
DATABASE_URL="postgres://…-pooler…/neondb?sslmode=require" pnpm db:migrate
DATABASE_URL="postgres://…-pooler…/neondb?sslmode=require" pnpm owner:create you@example.com "First name"
```

### Alternative: a schema inside an existing Supabase project

Free Supabase plans allow two active projects, so the app can share one with other demos, isolated in its own schema and role:

```sql
create role mts_app login password '<generated>';
alter role mts_app set search_path = mts;
create schema mts authorization mts_app;
revoke all on schema mts from public;
```

Apply the migration files as `mts_app` after replacing `"public".` with `"mts".` (Drizzle writes the schema into enum and foreign-key names). The `mts` schema is not exposed by Supabase's REST API and other roles cannot read it. Use the **transaction pooler** URL with the role's tenant-qualified user: `postgres://mts_app.<project-ref>:<password>@<pooler-host>:6543/postgres`, where `<pooler-host>` is copied from Supabase → *Connect* → *Transaction pooler* (it is `aws-0-…` or `aws-1-…` depending on the project; the wrong one fails with "tenant/user not found"). The client already disables prepared statements for it.

## 2. App (Vercel)

1. Import the GitHub repository in Vercel (framework detected: Next.js).
2. *Settings → Environment Variables*: `DATABASE_URL` = the Neon pooled URL (Production and Preview).
3. Deploy. The build does not need the database; the app connects at the first request.
4. Optional: *Settings → Deployment Protection* — keep Preview deployments protected.

## 3. On the iPhone

Open the Vercel URL in Safari, sign in, then *Share → Add to Home Screen*. The app opens full screen with its own icon.

## 4. Later changes

- Code: push to `main` → CI runs → Vercel deploys.
- Schema: `pnpm db:generate`, review the SQL, commit, then run `pnpm db:migrate` with the production `DATABASE_URL` **before** deploying code that needs it.

## Checklist before going live

- [ ] `DATABASE_URL` set only in Vercel (never committed)
- [ ] Migrations applied, owner created, sign-in works over HTTPS
- [ ] Wrong password → generic message; 6th attempt → locked for 15 min
- [ ] Import the real program from the iPhone or Mac, review flagged rows
- [ ] One full workout on the iPhone, then check Progress on the Mac
- [ ] Export JSON once and keep it as a backup
