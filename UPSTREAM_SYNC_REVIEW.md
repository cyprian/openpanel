# Upstream sync review — October 6, 2026

All 105 upstream commits since our June 6 baseline are incorporated on
`codex/upstream-sync-2026-10-06`. The user approved implementation of the
conflict resolutions after reviewing the compatibility risks on October 6.
The integration is finalized on this branch. `production` remains at
`f998191e`; nothing was pushed or deployed.

- Our baseline: `b94d2569766b1d7fa738325617a7742a5eac8df2`.
- Our production head: `f998191ed02626d58d1c295b27facd5d63c6b0fd`.
- Upstream head: `7c4d22ae4b6b20fb08eb5c94a0cd3cfebb3d32ca` (September 28).
- Initial overlap: 38 files; Git reported conflicts in 16 files.
- Preservation audit: all 118 paths changed by our fork remain present;
  79 are unchanged byte-for-byte from production. The remaining 39 include
  the 38 overlapping paths and the location regression test adapted to the
  new authentication helper.
- Existing migration files retain their names and contents. The code migration
  runner receives upstream's credential redaction; no migration was executed.

## Approved conflict resolutions

These resolutions preserve our custom workflows while adopting the upstream
updates. They were validated together before the integration was finalized.

| Area | Conflict | Resolution and resulting behavior |
| --- | --- | --- |
| Project creation | Our ML-aware form navigates immediately; upstream adds a credentials/setup screen. | Keep our tracking cards and exclusive ML selection. ML projects still open the ML dashboard immediately and offer credential download. Analytics projects show credentials and a “Set up tracking” link that seeds session storage for upstream's connect/verify flow. |
| Slack integrations | Our setup diagnostics and organization navigation overlap upstream's project-scoped integrations, authorization, and credential encryption. | Retain checks for all four Slack environment variables; use upstream's project authorization and OAuth project metadata. Existing organization-wide integrations retain upstream's legacy handling. Add Integrations to the ML sidebar, and point the ML “Connect Slack” link at the project's integration page. |
| ML notification rules | Our Slack-only metric workflow and post-write cache invalidation overlap upstream's destination-type and permission checks. | Apply both filters: destinations must support notifications, and ML metric dialogs remain Slack-only. Keep upstream's write access and destination ownership checks. Invalidate worker caches after successful create/update/delete; when moving a rule, clear both projects. |
| ML data and background work | Prisma relations and cron/queue declarations overlap new export and session functionality. | Keep all ML models, relations, metric buffers, and cron jobs, alongside upstream's exports, watermarks, session reaper/vacuum, and other new jobs. Preserve the ML metric table and its recorded migration filename. |
| MCP and dashboard routes | Our ML tool registration and routes overlap upstream's dashboard-management tools and integration-route moves. | Register both ML and dashboard-management tools, document both, and regenerate routes from the combined source files. ML overview rendering stays separate from the analytics activation banner. |
| Configuration and deployment | Our registry/Slack settings overlap encryption and social-login settings. | Preserve registry credentials, Slack variables, source-build heap allowance, ML/package volumes, and proxy routes. Include upstream's encryption configuration and optional OAuth/GSC variables. Document optional Bull Board credentials; it stays disabled when they are absent. |

## Every Git conflict

| File | Resolution |
| --- | --- |
| `.env.example` | Combine Slack and upstream OAuth/GSC/Kafka settings; preserve `SELF_HOSTED=true`. |
| `apps/public/content/docs/mcp/index.mdx` | Keep ML tools and add upstream dashboard management tools. |
| `apps/public/content/docs/self-hosting/environment-variables.mdx` | Keep the shared Kubernetes link once; retain both sets of environment documentation. |
| `apps/start/src/modals/add-notification-rule.tsx` | Combine notification-kind filtering with Slack-only ML defaults and update the integration link. |
| `apps/start/src/modals/add-project.tsx` | Keep ML cards/navigation; add analytics credentials and setup flow. |
| `apps/start/src/routeTree.gen.ts` | Regenerate with all ML routes and new project integration routes. |
| `apps/start/src/routes/_app.$organizationId.$projectId.index.tsx` | Keep ML page context/rendering; add activation banner only to analytics overview. |
| `apps/worker/src/jobs/cron.ts` | Include ML metric buffer and every upstream job; remove duplicate Job import. |
| `packages/db/prisma/schema.prisma` | Include ML relations, export watermarks, and project integrations. |
| `packages/integrations/src/slack.ts` | Preserve complete setup diagnostics and carry project ID in OAuth metadata. |
| `packages/mcp/src/tools/index.ts` | Register both tool families. |
| `packages/queue/src/queues.ts` | Include both `flushMlMetrics` and `flushExports`. |
| `packages/trpc/src/routers/integration.ts` | Combine Slack diagnostics with upstream project authorization and encrypted/redacted configs. |
| `packages/trpc/src/routers/notification.ts` | Combine ownership/type checks with post-write invalidation. |
| `self-hosting/.env.template` | Keep registry/Slack configuration and add encryption/OAuth/GSC documentation. |
| `self-hosting/quiz.ts` | Generate both package registry token and independent AES encryption key. |

## Issues found outside textual conflicts

- **Location authentication:** Git would remove the `getCache` import while our
  location endpoint still called it. The endpoint now uses upstream's
  verification helper, shares successful SDK verification caches, and rejects
  cached negative results. Added regression tests and updated the route test.
- **ML integration navigation:** upstream moved integrations from organization
  to project scope, but our ML sidebar had no project integration link.
  Added the link and regression coverage for both project types.
- **Notification caches:** preserve our invalidation timing so the worker does
  not continue using a stale rule after a create, move, or deletion. Added tests
  that also enforce the new read/write and destination ownership rules.
- **Worker startup:** upstream placed Bull Board registration inside the
  `/healthcheck` callback. Moved it into startup so the dashboard mounts once,
  behind Basic auth, while the health check stays independent.
- **Router typing:** the async router factory was registered as a Promise.
  Use `Awaited<ReturnType<typeof getRouter>>` so route/parameter checks validate
  the actual combined route tree.
- **Email logging:** retained delivery diagnostics while replacing raw SMTP
  recipient arrays and response text with counts and a redacted address.
  Upstream's protection against logging reset/unsubscribe payloads is retained.
- **Migration number 18:** our `18-add-ml-metrics.ts` and upstream's
  `18-events-profile-id-index.ts` can coexist: the runner tracks full filenames,
  and these migrations operate on separate tables. Do not rename a migration
  already recorded in production.

## Verification

Checked with Node 24.19.0 and pnpm 11.23.0. The cached Node runtime was used for
verification; the system Node installation was not changed.

- Frozen lockfile installation and supply-chain verification passed.
- Combined Prisma schema validation and client/type generation passed.
- Workspace type checking passed, including the dashboard.
- API, worker, and Nitro dashboard production builds passed.
- Selected regression suites: **421 passed, 1 skipped**.

| Suite | Passed | Coverage |
| --- | ---: | --- |
| API | 52 | Verified-secret auth, custom location route, package registry, image proxy, rate limiting, URL redaction, subscription guards. |
| tRPC | 53 | Access rules, integration redaction, ML notification mutations/cache invalidation, shared access, references, disk usage. |
| Database unit tests | 39 | ML run/metric behavior, notifications, profile-column allowlists, chart field resolution. |
| Worker | 37 | Basic auth, notifications, sessions, export flushing, self-hosted trial safeguards, onboarding. The GCS emulator test was skipped because the emulator is unavailable. |
| Dashboard | 16 | ML metric notifications, settings inspection, project selection/deletion, project creation, integration navigation. |
| Common | 63 | Encryption, SSRF/safe fetch, trusted IP handling, user-agent overrides, referrers. |
| Template runtime | 80 | Validator restrictions and isolated execution security regressions. |
| Validation | 26 | Cohorts and integration schemas. |
| MCP | 55 | ML tools, dashboard management, shared tool helpers, authentication. |

Docker is not running on this machine. Full PostgreSQL/ClickHouse/Redis
integration tests, migration rehearsal, Docker image builds, and deployment
smoke tests remain unverified. Passing unit tests and local production builds
do not substitute for those checks. No database migrations, deployment scripts,
formatter commands, or outbound notifications were run.

## Compatibility checks before rollout

- The upstream permission backfill promotes **every existing read project grant
  to write**. Inspect actual grants and record any deliberately read-only users
  before rollout; restore those grants immediately after migration before
  opening access. The upstream assumption that old read grants were accidental
  must not replace an audit of our deployment.
- Validate saved JavaScript webhook templates with the stricter template
  validator. Rewrite rejected templates before they are used for delivery.
- Invalid client secrets and previously unauthorized mutations now fail;
  verify the actual SDK clients and automation credentials.
- Legacy organization integration bookmarks can change; the ML sidebar and
  Slack setup link use the new project-scoped routes.
- Bull Board requires both username and password to mount. Missing credentials
  disable its UI while health and metrics endpoints remain available.
- Preserve the encryption key used by GSC, 2FA, and encrypted export credentials.
  Slack/webhook credentials currently receive redaction; the registry explicitly
  keeps those fields plaintext until their delivery readers support decryption.
- The session transition and historical cohort backfills require staging and a
  rollback plan. Code-level regression checks do not verify production data.

## First-rollout requirements after code review

The initial deployment needs a planned session transition; do not use the
ordinary one-step `deploy.sh` or `self-hosting/update` rollout without it.

1. Rehearse against staging and take recoverable PostgreSQL, ClickHouse, Redis,
   ML artifact, and package registry backups. Keep current deployment images.
2. Verify `SELF_HOSTED=true` in the API, worker, and dashboard. Preserve the
   current `COOKIE_SECRET` and any existing `ENCRYPTION_KEY`; do not rotate an
   encryption key used for stored credentials. New encryption configuration
   must reach all services that read/write integration secrets.
3. Confirm how the real deployment is built from this fork and that ML/package
   volumes and `/ml` and `/packages` proxy routes remain mounted. The repository's
   shell deploy helper invokes a separate server script; that server script
   was not inspected or executed in this task.
4. Prepare upstream's session migration runbook in
   `packages/db/scripts/migrate-sessions.ts`: pause the ingestion and sessions
   queues, drain in-flight jobs, and convert legacy Redis session records before
   resuming ingestion under the new worker.
5. Account for **14 new Prisma migrations and 8 new code migration files**.
   Cohort migration 21 rebuilds historical partitions and can take hours;
   staging must establish its capacity/window before the old materialized
   views are dropped by migration 23. Existing ML migrations remain in place.
6. After the new session flow is healthy, use upstream's
   `packages/db/scripts/drain-old-session-jobs.ts` cleanup before resuming the
   sessions queue. These scripts include dry-run modes and ordering notes.
7. Smoke test analytics and ML project creation; Python ML run/metric/image
   ingestion; comparison, evaluation, bulk deletion, and storage displays;
   Slack install/rule/delivery; location lookup; package publishing/downloads;
   MCP ML and dashboard tools; sessions/replays; exports; and share access.

The code integration is approved and finalized on the review branch.
Deployment remains a separate follow-up after the infrastructure checks and
session migration rehearsal.
