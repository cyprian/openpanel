# Eyepic OpenPanel Customizations

This repository is a fork of the upstream open-source OpenPanel project. This
document records the features and operational changes that are specific to the
Eyepic deployment so future upstream merges can preserve them deliberately.

Last reviewed from the custom branch history:

- Custom branch: `production`
- Upstream baseline in this clone: `main` at `b94d2569`
- Custom commit range reviewed: `main..production`

## Why this document exists

OpenPanel continues to move upstream, while this fork has product-specific
analytics, ML experiment tracking, package distribution, deployment, and docs
changes. When pulling upstream changes, treat this file as the starting checklist
for what must keep working after the merge.

## Custom Feature Areas

### ML project type and dashboard experience

Eyepic added a first-class `ML` project type on top of OpenPanel's normal
analytics project model. ML projects reuse the existing organization, project,
client, auth, and settings infrastructure, but route users into experiment
tracking screens instead of the standard product analytics dashboard.

Important behavior:

- Project creation and project settings understand `ML` as a project type.
- Sidebar and project cards hide or adjust analytics-only navigation for ML
  projects.
- ML project routes live under dashboard project routes.
- ML overview navigation was removed so ML users land in the run/project
  workflows directly.
- Dashboard Docker builds use a larger Node heap to support the expanded
  dashboard build.

Main files to watch:

- `apps/start/src/modals/add-project.tsx`
- `apps/start/src/components/projects/project-card.tsx`
- `apps/start/src/components/sidebar.tsx`
- `apps/start/src/components/sidebar-project-menu.tsx`
- `apps/start/src/components/settings/edit-project-details.tsx`
- `apps/start/src/routes/_app.$organizationId.$projectId.ml.tsx`
- `apps/start/src/routes/_app.$organizationId.$projectId.ml.*.tsx`
- `apps/start/Dockerfile`

Related commits:

- `51dd3a1a` Add ML experiment tracking MVP
- `c6b7c773` Improve ML project UX and source deploys
- `a3376f13` Fix ML project detail routing
- `bc498d1e` Fix ML project child route rendering
- `5a649286` Remove ML overview nav link
- `a9c19181` Increase dashboard Docker build heap

### ML experiment tracking backend

The fork adds a dedicated ML tracking backend. It stores ML project/run metadata
in PostgreSQL through Prisma and logs scalar metrics in ClickHouse through a
buffered ingestion path. The API exposes endpoints for creating runs, updating
run state, logging metrics, uploading images, and recording visual evaluation
rows.

Important behavior:

- `MlProject`, `MlRun`, and image/evaluation metadata are Prisma-managed.
- ML metric events are inserted into ClickHouse through `mlMetricBuffer`.
- Runs can store config, metadata, notes, tags, status, start/end timestamps,
  final metrics, and summaries.
- ML API routes are protected with the existing client hook.
- Worker cron/debug boot files include the ML metric buffer lifecycle.

Main files to watch:

- `apps/api/src/routes/ml.router.ts`
- `apps/api/src/controllers/ml.controller.ts`
- `packages/db/src/services/ml.service.ts`
- `packages/db/src/buffers/ml-metric-buffer.ts`
- `packages/db/prisma/schema.prisma`
- `packages/db/code-migrations/18-add-ml-metrics.ts`
- `packages/validation/src/ml.validation.ts`
- `packages/trpc/src/routers/ml.ts`
- `apps/worker/src/boot-cron.ts`
- `apps/worker/src/jobs/cron.ts`

Related commits:

- `51dd3a1a` Add ML experiment tracking MVP
- `61f52cf2` Improve ML run metric charts
- `f3edf762` Harden ML comparison and add image logging
- `944fab09` Implement ML visual evaluation tables

### ML run pages, charts, comparison, images, and visual evaluation

The dashboard includes a custom ML run detail component and compare screen. The
UI focuses on experiment workflows: run status, final metrics, metric charts,
config/metadata, notes, tags, logged images, and visual evaluation rows.

Important behavior:

- Run detail pages support direct routes and nested ML project routes.
- Comparison overlays metric series across runs and compares metadata/final
  metrics.
- Image logging and visual evaluation tables support inspecting model outputs.
- The layout was iterated to make ML runs easier to scan and compare.

Main files to watch:

- `apps/start/src/components/ml/run-detail.tsx`
- `apps/start/src/components/ml/status-badge.tsx`
- `apps/start/src/routes/_app.$organizationId.$projectId.ml.compare.tsx`
- `apps/start/src/routes/_app.$organizationId.$projectId.ml.runs.tsx`
- `apps/start/src/routes/_app.$organizationId.$projectId.ml.runs.$runId.tsx`
- `apps/start/src/routes/_app.$organizationId.$projectId.ml.projects.$mlProjectId.tsx`
- `apps/start/src/routes/_app.$organizationId.$projectId.ml.projects.$mlProjectId.runs.$runId.tsx`

Related commits:

- `43756d2e` Improve ML run detail navigation
- `4809746b` Fix ML run detail back link rendering
- `61f52cf2` Improve ML run metric charts
- `f3edf762` Harden ML comparison and add image logging
- `1ff88522` Improve ML image evaluation workflow
- `944fab09` Implement ML visual evaluation tables
- `14f329d5` Improve ML run comparison
- `af48baa3` Improve ML run page layout

### ML storage for self-hosted deployments

Uploaded ML images are stored on local server storage by default. The self-hosted
templates and update script add persistent volumes so ML artifacts survive
container updates.

Important behavior:

- `ML_STORAGE_DIR` controls local ML image storage.
- Default storage path is `/var/lib/openpanel/ml`.
- Self-hosting templates mount a persistent `op-ml-storage` volume.
- The update script backfills the volume and proxy routes into existing
  self-hosted installs.

Main files to watch:

- `packages/db/src/services/ml.service.ts`
- `self-hosting/.env.template`
- `self-hosting/docker-compose.template.yml`
- `self-hosting/coolify.yml`
- `self-hosting/caddy/Caddyfile.template`
- `self-hosting/update`

Related commits:

- `61b45d07` Persist ML storage on self-hosted updates
- `c6b7c773` Improve ML project UX and source deploys

### Python ML SDK distribution and package registry

The Python ML SDK was moved out of this monorepo and is now distributed through
the Eyepic-hosted OpenPanel package registry. The API implements a small PEP 503
compatible package index so `pip` can install `openpanel-ml` from the deployed
OpenPanel instance.

Important behavior:

- Package index is available at `/packages/simple`.
- Distribution files are served from `/packages/files/:packageName/:filename`.
- Uploads use `PUT /packages/api/:packageName/:filename`.
- Upload auth uses `PACKAGE_REGISTRY_TOKEN` with a bearer token.
- Package storage defaults to `/var/lib/openpanel/packages`.
- Self-hosting update generates or preserves `PACKAGE_REGISTRY_TOKEN` and prints
  the token so it can be copied into the Python SDK repository's GitHub Actions
  secrets.
- Caddy and Docker Compose templates include package registry proxying and
  storage.

Main files to watch:

- `apps/api/src/routes/package-registry.router.ts`
- `apps/api/src/routes/package-registry.router.test.ts`
- `apps/api/src/app.ts`
- `self-hosting/docker-compose.template.yml`
- `self-hosting/coolify.yml`
- `self-hosting/caddy/Caddyfile.template`
- `self-hosting/update`

Related commits:

- `97ee7526` Remove Python ML SDK package
- `e819f06d` Add package registry hosting
- `114dbaa8` Print package registry token on update

### ML tracking documentation inside the dashboard

ML tracking docs were moved into the dashboard so users configuring ML projects
can read setup instructions in context. The docs explain project setup, client
credentials, Python package installation, run initialization, metric logging,
image logging, visual evaluation rows, run finalization, storage, and HTTP API
endpoints.

Important behavior:

- ML docs route is a dashboard route, not just public docs.
- The docs include Python SDK examples for `openpanel-ml`.
- Syntax rendering was adjusted to support the dashboard docs content.
- Public docs navigation was adjusted after moving ML docs into the dashboard.

Main files to watch:

- `apps/start/src/routes/_app.$organizationId.$projectId.ml.docs.tsx`
- `apps/start/src/components/syntax.tsx`
- `apps/public/content/docs/meta.json`

Related commits:

- `20e5c10f` Add ML experiment tracking docs
- `24bb8a5d` Move ML tracking docs into dashboard
- `e975fe9e` Improve ML tracking docs

### Location lookup endpoint

The fork adds a project-gated location lookup endpoint. It resolves the request
IP into country metadata and returns whether that country is in the EU. This is
useful for clients that need lightweight location metadata without exposing the
full analytics ingestion flow.

Important behavior:

- Route is rate limited.
- Auth uses a custom location request validator.
- Projects must enable location lookup before the endpoint returns data.
- Response includes `country`, `country_code`, and `is_eu`.

Main files to watch:

- `apps/api/src/routes/location.router.ts`
- `apps/api/src/controllers/location.controller.ts`
- `apps/api/src/routes/location.router.test.ts`
- `apps/api/src/utils/auth.ts`
- `apps/start/src/components/settings/edit-project-details.tsx`
- `packages/db/prisma/schema.prisma`

Related commits:

- `f6599c22` Add project location lookup endpoint
- `7edb1586` Return country metadata from location endpoint

### Deployment helper and fork guidance

The fork includes deployment helper changes for source-based Eyepic deployment.
The self-hosting update flow builds local images from source, updates the
running self-hosted stack, preserves custom persistent storage, and prints
package registry details when available.

Important behavior:

- `deploy.sh` was added as a deployment helper.
- `self-hosting/update` builds `op-api`, `op-worker`, and `op-dashboard` images
  from the local repository before restarting services.
- Existing self-hosting configs are patched for ML and package registry routes
  and volumes.
- `AGENTS.md` records repository-specific Codex guidance for this fork.

Main files to watch:

- `deploy.sh`
- `self-hosting/update`
- `self-hosting/caddy/Caddyfile.template`
- `self-hosting/docker-compose.template.yml`
- `self-hosting/coolify.yml`
- `AGENTS.md`

Related commits:

- `8a4d6bb2` Add deployment helper and repo guidance
- `c6b7c773` Improve ML project UX and source deploys
- `61b45d07` Persist ML storage on self-hosted updates
- `e819f06d` Add package registry hosting
- `114dbaa8` Print package registry token on update

### Smoke testing

The fork includes a small Python smoke test for ML tracking.

Main files to watch:

- `scripts/ml-smoke-64.py`

Related commits:

- `51dd3a1a` Add ML experiment tracking MVP

## Custom Commit Inventory

These commits are the reviewed custom history on `production` that is not in the
local `main` branch:

| Commit | Summary |
| --- | --- |
| `51dd3a1a` | Add ML experiment tracking MVP |
| `a9c19181` | Increase dashboard Docker build heap |
| `c6b7c773` | Improve ML project UX and source deploys |
| `a3376f13` | Fix ML project detail routing |
| `43756d2e` | Improve ML run detail navigation |
| `bc498d1e` | Fix ML project child route rendering |
| `4809746b` | Fix ML run detail back link rendering |
| `61f52cf2` | Improve ML run metric charts |
| `f3edf762` | Harden ML comparison and add image logging |
| `61b45d07` | Persist ML storage on self-hosted updates |
| `1ff88522` | Improve ML image evaluation workflow |
| `944fab09` | Implement ML visual evaluation tables |
| `8a4d6bb2` | Add deployment helper and repo guidance |
| `f6599c22` | Add project location lookup endpoint |
| `7edb1586` | Return country metadata from location endpoint |
| `20e5c10f` | Add ML experiment tracking docs |
| `24bb8a5d` | Move ML tracking docs into dashboard |
| `14f329d5` | Improve ML run comparison |
| `af48baa3` | Improve ML run page layout |
| `5a649286` | Remove ML overview nav link |
| `e975fe9e` | Improve ML tracking docs |
| `97ee7526` | Remove Python ML SDK package |
| `e819f06d` | Add package registry hosting |
| `114dbaa8` | Print package registry token on update |

## Merge Checklist

When merging upstream OpenPanel into this fork:

1. Confirm Prisma migrations and schema still include ML projects, runs, images,
   evaluation data, package registry settings, and location lookup flags.
2. Confirm ClickHouse table definitions and the ML metric buffer still compile
   and flush.
3. Confirm API registration still mounts `/ml`, `/packages`, and `/location`.
4. Confirm dashboard routes still include ML docs, projects, runs, compare, and
   run detail pages.
5. Confirm ML project type still changes navigation and onboarding behavior.
6. Confirm self-hosting templates and `self-hosting/update` still preserve
   `/var/lib/openpanel/ml` and `/var/lib/openpanel/packages`.
7. Confirm `PACKAGE_REGISTRY_TOKEN`, `PACKAGE_REGISTRY_DIR`, and `ML_STORAGE_DIR`
   remain documented and wired into deployment.
8. Run focused tests for package registry and location lookup after relevant
   merges:

```bash
pnpm vitest run apps/api/src/routes/package-registry.router.test.ts
pnpm vitest run apps/api/src/routes/location.router.test.ts
```

Do not run formatting as part of this checklist. The project instruction is to
avoid formatting until the larger PRs have been merged.
