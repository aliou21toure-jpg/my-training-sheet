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
