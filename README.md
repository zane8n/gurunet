# GURUnet

GURUnet is a personal development web app for daily network engineering,
cybersecurity, Linux, scripting, troubleshooting, automation, and documentation
challenges.

The current build is a functional Next.js MVP that reformats the daily challenge
rules from `context.txt` into a web-app experience: signup/login, protected
sessions, daily challenge creation, submissions, verification checks, grading,
penalties, PIS, ERT, recovery restrictions, redemption ledger, progress tracker,
and notebook flow.

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js App Router + TypeScript | Full-stack JS with page routing and REST route handlers. |
| UI | Tailwind CSS + lucide-react | Minimal teal/off-white interface with icon-based controls. |
| Animation | Framer Motion | Installed for later interaction polish. |
| Auth | Auth.js + custom credentials routes | Google SSO uses Auth.js with the Prisma adapter. The existing email/password flow still uses app route handlers and bcrypt. |
| Database | PostgreSQL | Recommended production database. |
| ORM | Prisma | Installed for schema and migration work. |
| AI | OpenAI API | Used for high-quality challenge generation, verification questions, grading critique, and notebook language. Deterministic code still owns score math, caps, PIS, ERT, streaks, and redemptions. |
| Hosting | Vercel | Good fit for the Next.js app; defer deployment until the app behavior is approved. |

The local MVP still uses a small JSON datastore in `.data/gurunet.json` for
challenge/progress data. Google SSO and Auth.js session/account records use
PostgreSQL through Prisma. `.data/` is intentionally ignored by Git.

## Local Setup

Install dependencies:

```bash
pnpm install
```

Run the development server:

```bash
pnpm dev
```

Open:

```text
http://localhost:3000
```

Run a production build check:

```bash
pnpm build
```

Run linting:

```bash
pnpm lint
```

Run Prisma generation when switching the persistence layer to PostgreSQL:

```bash
pnpm prisma:generate
```

Validate the Prisma 7 schema/config:

```bash
pnpm prisma validate
```

Apply the schema directly to a local database:

```bash
pnpm prisma db push
```

`prisma migrate dev` requires the configured database user to create a shadow
database. Grant `CREATEDB` to that user or configure a dedicated shadow database
before using migrations.

## Git Setup

This project is intended to be committed and pushed later. The repository should
track source files, docs, lockfiles, and safe examples, while ignoring
dependencies, builds, local secrets, and Vercel output.

The project includes:

- `.gitignore` for `node_modules`, `.next`, `.env*`, `.vercel`, logs, and build
  artifacts.
- `.gitattributes` for consistent LF line endings.
- `.env.example` as the safe template for local configuration.

Initialize Git locally:

```bash
git init -b main
git add .
git commit -m "Initial GURUnet app"
```

If your shell reports `fatal: not a git repository` while a read-only empty
`.git` directory exists, remove that empty placeholder first:

```bash
rmdir .git
git init -b main
```

Then add your GitHub remote when you are ready to push:

```bash
git remote add origin git@github.com:YOUR_USER/YOUR_REPO.git
git push -u origin main
```

## Required Environment Variables

Configure these for the app backend:

```bash
DATABASE_URL="postgresql://..."
AUTH_SECRET="..."
AUTH_URL="http://localhost:3000"
AUTH_GOOGLE_ID="..."
AUTH_GOOGLE_SECRET="..."
DEEPSEEK_API_KEY="..."
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_ENABLED="true"
DEEPSEEK_FAST_MODEL="deepseek-v4-flash"
DEEPSEEK_REASONING_MODEL="deepseek-v4-pro"
JOB_SECRET="..."
IMPORT_SECRET="..."
GURUNET_UPLOAD_DIR=".data/uploads"
```

For local development, place them in `.env.local`.

## Product Behavior

The app should treat the daily task rules as deterministic product logic:

- Unlock one challenge at 08:00 local time.
- Hide solutions until the user submits.
- Record the exact submission timestamp.
- Apply late, missed, unsafe-answer, and technical-correctness caps in code.
- Let AI assist challenge generation and grading, but do not let AI directly
  mutate PIS or ERT balances.
- Generate a notebook entry after grading from the challenge, submission, and
  correction.

DeepSeek usage:

- Challenge generation and notebook summaries use `DEEPSEEK_FAST_MODEL`.
- Strict verification and correction use `DEEPSEEK_REASONING_MODEL` with
  thinking enabled.
- The app reads only final JSON content from DeepSeek responses. It does not
  display or persist `reasoning_content`.
- The app falls back to local templates if the API is disabled or unavailable.
- Keep `DEEPSEEK_ENABLED="false"` for offline/dev-only testing.
- Scoring math, late penalties, technical caps, PIS, ERT, streaks, and
  redemption balances remain deterministic backend logic.

Implemented dynamic flows:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/me`
- `PATCH /api/me`
- `GET /api/me/stats`
- `GET /api/challenges/today`
- `POST /api/challenges/generate`
- `GET /api/challenges/history`
- `POST /api/challenges/:id/submit`
- `POST /api/submissions/:id/verification`
- `POST /api/submissions/:id/grade`
- `GET /api/pis`
- `GET /api/ert`
- `POST /api/ert/redeem`
- `GET /api/ert/redemptions`
- `GET /api/notebook`
- `GET /api/notebook/:id`
- `PATCH /api/notebook/:id`

## Planned REST Surface

Auth:

```text
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/session
```

Challenges and submissions:

```text
GET  /api/challenges/today
POST /api/challenges/generate
GET  /api/challenges/:id
GET  /api/challenges/history
POST /api/challenges/:id/submit
POST /api/submissions/:id/verification
POST /api/submissions/:id/grade
```

Progress and notebook:

```text
GET   /api/me/stats
GET   /api/pis
GET   /api/ert
POST  /api/ert/redeem
GET   /api/notebook
GET   /api/notebook/:id
PATCH /api/notebook/:id
```

## Suggested Database Tables

- `users`
- `sessions`
- `accounts`
- `challenges`
- `submissions`
- `grades`
- `pis_events`
- `ert_events`
- `ert_redemptions`
- `notebook_entries`
- `weekly_discipline_records`

## Deployment Notes

When ready:

1. Push the repository to GitHub.
2. Import it into Vercel.
3. Set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, Google OAuth env vars,
   `DEEPSEEK_API_KEY`, `JOB_SECRET`, and `IMPORT_SECRET` in Vercel project
   settings.
4. Attach a production PostgreSQL database.
5. Use build command `pnpm vercel-build` if you want Vercel to run
   `prisma migrate deploy` during deployment. Otherwise run
   `pnpm prisma:deploy` from a trusted machine before deploying.

Deployment caveats:

- `pnpm build` runs `prisma generate` before `next build` so Vercel does not
  typecheck against a stale Prisma Client.
- If your Postgres provider requires SSL, include the provider-specific SSL
  option in `DATABASE_URL`, for example `?sslmode=require`.
- Local upload storage is suitable for development. Vercel serverless storage is
  ephemeral, so production evidence uploads should move to Vercel Blob or
  S3-compatible storage before relying on long-term file retention.
- `POST /api/ai/jobs/run` should be triggered by a cron job or protected manual
  call using `JOB_SECRET`.

Vercel Hobby is suitable for personal/non-commercial use. Payment features,
paid users, or commercial workflows should move to a paid deployment plan.
