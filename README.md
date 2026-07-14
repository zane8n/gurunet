# GURUnet

Designed by Kikandi.

GURUnet is a personal development web app for daily network engineering,
cybersecurity, Linux, scripting, troubleshooting, automation, and documentation
challenges.

The current build is a functional Next.js web app plus a modular app-platform
foundation: signup/login, protected sessions, personalized daily challenge
creation, submissions, verification checks, grading, penalties, PIS, ERT,
recovery restrictions, redemption ledger, progress tracker, notebook flow,
private social invitations, app tokens, secure uploads, and native app shells.

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js App Router + TypeScript | Full-stack JS with page routing and REST route handlers. |
| UI | Tailwind CSS + lucide-react | Minimal teal/off-white interface with icon-based controls. |
| Animation | Framer Motion | Installed for later interaction polish. |
| Auth | Auth.js + custom credentials routes | Google SSO uses Auth.js with the Prisma adapter. The existing email/password flow still uses app route handlers and bcrypt. |
| Database | PostgreSQL | Recommended production database. |
| ORM | Prisma | Installed for schema and migration work. |
| AI | OpenAI + DeepSeek | OpenAI generates daily challenges and teaching-grade corrections. DeepSeek handles examiner chat, verification, and notebook summaries. Deterministic code still owns score math, caps, PIS, ERT, streaks, and redemptions. |
| Hosting | Vercel | Production web/API host with cron and Blob storage support. |

Runtime data is stored in PostgreSQL through Prisma. Local `.data` files are
only used for development backup/import sources and local upload storage.

## Credit And License

GURUnet is designed by Kikandi. The project is distributed under the Apache
License, Version 2.0. Keep the Kikandi attribution in user-facing credits and
project notices unless a separate written agreement says otherwise. See
`LICENSE` and `NOTICE`.

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

Run platform structure checks:

```bash
pnpm test:platform
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
DEEPSEEK_FALLBACK_ONLY="false"
DEEPSEEK_FAST_MODEL="deepseek-v4-flash"
DEEPSEEK_REASONING_MODEL="deepseek-v4-pro"
OPENAI_API_KEY="..."
OPENAI_CHALLENGE_ENABLED="true"
OPENAI_CHALLENGE_MODEL="gpt-5.4-mini"
OPENAI_CRITIQUE_ENABLED="true"
OPENAI_CRITIQUE_MODEL="gpt-5.4-mini"
AI_DAILY_CALL_LIMIT="100"
AI_USER_DAILY_CALL_LIMIT="20"
AI_DAILY_SPEND_CAP_USD="5"
JOB_SECRET="..."
IMPORT_SECRET="..."
GURUNET_UPLOAD_DIR=".data/uploads"
BLOB_STORE_ID="..."
BLOB_READ_WRITE_TOKEN="..."
APP_TOKEN_SECRET="..."
CRON_SECRET="..."
AUTH_APPLE_ID="..."
AUTH_APPLE_SECRET="..."
AUTH_GITHUB_ID="..."
AUTH_GITHUB_SECRET="..."
EXPO_PUBLIC_EAS_PROJECT_ID="your-expo-eas-project-id"
```

For local development, place them in `.env.local`.

## Product Behavior

The app should treat the daily task rules as deterministic product logic:

- Unlock one challenge at 08:00 local time.
- Select a user-specific generation blueprint from profile topics, preferred
  formats, recent history, and same-day platform history.
- Rotate topic focus, assessment mode, setting, practitioner role, evidence
  style, and constraints; reject repeated titles, semantic blueprints, and
  identical challenge content.
- Hide solutions until the user submits.
- Record the exact submission timestamp.
- Apply late, missed, unsafe-answer, and technical-correctness caps in code.
- Let AI assist challenge generation and grading, but do not let AI directly
  mutate PIS or ERT balances.
- Generate a notebook entry after grading from the challenge, submission, and
  correction.
- Keep social rankings private to accepted connections only.
- Keep the complete user directory inside the admin surface.

AI usage:

- Challenge generation and post-submission teaching corrections use OpenAI.
  They run once per challenge through idempotent Prisma jobs.
- Examiner chat and notebook summaries use `DEEPSEEK_FAST_MODEL`.
- Verification uses `DEEPSEEK_REASONING_MODEL` with thinking enabled.
- The app reads only final JSON content from DeepSeek responses. It does not
  display or persist `reasoning_content`.
- The app falls back to the same profile-aware blueprint and procedural packet
  if OpenAI is disabled or unavailable; it does not return the former fixed
  ACL/STP templates.
- Keep `DEEPSEEK_ENABLED="false"` for offline/dev-only testing.
- Use `DEEPSEEK_FALLBACK_ONLY="true"` or `AI_FALLBACK_ONLY="true"` to force
  deterministic fallback behavior while keeping the rest of the app online.
- `AI_DAILY_CALL_LIMIT`, `AI_USER_DAILY_CALL_LIMIT`, and
  `AI_DAILY_SPEND_CAP_USD` gate DeepSeek calls. Token usage and estimated cost
  are logged in `AiUsage`.
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
- `POST /api/challenges/:id/notice`
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
3. Set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, OAuth env vars,
   `APP_TOKEN_SECRET`, `CRON_SECRET`, Blob env vars, `DEEPSEEK_API_KEY`,
   `JOB_SECRET`, and `IMPORT_SECRET` in Vercel project settings.
4. Attach a production PostgreSQL database.
5. Use build command `pnpm vercel-build` if you want Vercel to run
   `prisma migrate deploy` during deployment. Otherwise run
   `pnpm prisma:deploy` from a trusted machine before deploying.

Deployment caveats:

- `pnpm build` runs `prisma generate` before `next build` so Vercel does not
  typecheck against a stale Prisma Client.
- `prisma generate` can run during Vercel `postinstall` without a database URL,
  but `pnpm vercel-build` still requires a real hosted database URL before it can
  run `prisma migrate deploy`.
- On Vercel, database resolution skips localhost URLs and accepts
  `DATABASE_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`,
  `POSTGRES_URL`, or `NEON_DATABASE_URL`. Prefer setting `DATABASE_URL` to the
  Neon pooled connection string and `POSTGRES_URL_NON_POOLING` to the Neon direct
  connection string if Neon provides both.
- For the production domain, set `AUTH_URL=https://gurunet.uk`. In Google Cloud,
  add `https://gurunet.uk/api/auth/callback/google` as an authorized redirect
  URI.
- If your Postgres provider requires SSL, include the provider-specific SSL
  option in `DATABASE_URL`, for example `?sslmode=require`.
- Local upload storage is suitable for development. Production evidence files
  use Vercel Blob when Blob env vars are present, including direct client upload
  support through `/api/v1/uploads/direct`.
- `/api/cron/platform` is the Vercel Cron entry point for AI jobs,
  notification materialization/delivery, session cleanup, and retry cleanup.
  Set `CRON_SECRET` to guard manual calls. The repository keeps a once-daily
  schedule so deployments remain compatible with Vercel Hobby.
- Android and iOS push delivery uses Expo Push. Set `EXPO_PUBLIC_EAS_PROJECT_ID`
  in each EAS build environment and configure APNs/FCM credentials in the Expo
  project. Time-sensitive challenge, study-block, recovery, and deadline cues are
  also scheduled on-device so they do not depend on Vercel cron precision.
  Windows schedules the same cues through Tauri and consumes the authenticated
  notification inbox; the web client shows in-app alerts and, with browser
  permission, system alerts while GURUnet is open.

Vercel Hobby is suitable for personal/non-commercial use. Payment features,
paid users, or commercial workflows should move to a paid deployment plan.
