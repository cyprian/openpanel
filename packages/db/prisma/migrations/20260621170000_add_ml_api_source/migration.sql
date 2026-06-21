-- AlterTable
ALTER TABLE "ml_projects" ADD COLUMN "clientId" UUID;

-- AlterTable
ALTER TABLE "ml_runs" ADD COLUMN "clientId" UUID;

-- Backfill rows only when the analytics project has a single unambiguous API client.
WITH single_project_clients AS (
  SELECT "projectId", MIN("id") AS "clientId"
  FROM "clients"
  WHERE "projectId" IS NOT NULL
  GROUP BY "projectId"
  HAVING COUNT(*) = 1
)
UPDATE "ml_projects"
SET "clientId" = single_project_clients."clientId"
FROM single_project_clients
WHERE "ml_projects"."projectId" = single_project_clients."projectId";

WITH single_project_clients AS (
  SELECT "projectId", MIN("id") AS "clientId"
  FROM "clients"
  WHERE "projectId" IS NOT NULL
  GROUP BY "projectId"
  HAVING COUNT(*) = 1
)
UPDATE "ml_runs"
SET "clientId" = single_project_clients."clientId"
FROM single_project_clients
WHERE "ml_runs"."projectId" = single_project_clients."projectId";

-- CreateIndex
CREATE INDEX "ml_projects_clientId_idx" ON "ml_projects"("clientId");

-- CreateIndex
CREATE INDEX "ml_runs_clientId_idx" ON "ml_runs"("clientId");

-- AddForeignKey
ALTER TABLE "ml_projects" ADD CONSTRAINT "ml_projects_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml_runs" ADD CONSTRAINT "ml_runs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
