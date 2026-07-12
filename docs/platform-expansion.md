# GURUnet Platform Expansion

GURUnet now has a modular platform foundation: the existing web app remains the production Next.js application, while Android, iOS, and Windows live as independent application shells backed by shared contracts and API clients.

## Repository Shape

```text
apps/android      Expo / React Native Android app
apps/ios          Expo / React Native iOS app
apps/windows      Tauri 2 + React Windows app
packages/contracts     Zod DTOs and OpenAPI seed
packages/api-client    Bearer auth, refresh, retries, request IDs
packages/domain        scoring, deadline, reminder, social policy helpers
packages/sync          drafts, outbox, conflict utilities
packages/design-tokens semantic tokens only
packages/testing       fixtures and contract-test helpers
```

Rendered UI is intentionally not shared across platforms. The shared packages carry meaning, contracts, auth behavior, and domain rules only.

## App API

The app API is versioned under `/api/v1`. Browser cookie sessions and app bearer tokens are both accepted by `requireUser()`. Native clients use fifteen-minute access tokens and rotating ninety-day refresh tokens stored in platform secure storage.

Important routes include:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/bootstrap`
- `GET /api/v1/openapi`
- `GET /api/v1/challenges/today`
- `PUT /api/v1/drafts/:challengeId`
- `POST /api/v1/uploads`
- `POST /api/v1/uploads/direct`
- `GET /api/v1/social/network`
- `GET /api/v1/social/suggestions`
- `POST /api/v1/social/invitations`
- `PATCH /api/v1/social/settings`

`/api/v1/challenges/today` and `/api/v1/bootstrap` sanitize challenge internals. Worked solutions are not included in the app challenge contract before submission.

## Social Privacy

The Network area is now private by default:

- The leaderboard is “Your network ranking,” not a global ranking.
- Ranking rows include only the signed-in user and accepted connections.
- Discoverability is disabled by default.
- Suggestions reveal only name, handle, preferred profession, discipline, and match reasons.
- Email invitations return a generic response whether or not the address exists.
- Full user directory access is admin-only through `/api/admin/users`.

## Uploads

The existing upload API still accepts multipart files and persists DB metadata. Production can also use Vercel Blob direct client uploads through `/api/v1/uploads/direct`. The direct route authenticates before issuing upload tokens and stores DB metadata from the Blob completion callback.

On Vercel, direct client uploads require `BLOB_READ_WRITE_TOKEN` in addition to `BLOB_STORE_ID`. Server-side Blob access can use Vercel OIDC when available.

## Native Apps

Android and iOS use Expo with platform-specific tab navigation and SecureStore token storage. Windows uses Tauri 2, a desktop sidebar layout, Stronghold token storage, deep links, notifications, and updater wiring.

Current app release scope:

- Email/password app login
- Personalized daily challenge bootstrap
- Cross-device response drafts
- Final submission through server authority
- Network suggestions/invitations
- Account settings foundations

OAuth provider entry points are present on the backend; native Apple/GitHub/Google polish should be completed during the store-readiness pass.

## Operations

Vercel Cron calls `/api/cron/platform` for AI jobs, notification delivery, retry cleanup, and expired session cleanup. The route accepts `CRON_SECRET` when configured.

Run these checks before deploying:

```bash
pnpm exec prisma validate
pnpm exec tsc --noEmit
pnpm check:contracts
pnpm test:platform
pnpm --filter @gurunet/android typecheck
pnpm --filter @gurunet/ios typecheck
pnpm --filter @gurunet/windows typecheck
pnpm build
```
