CREATE TABLE "ml_images" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" TEXT NOT NULL,
  "step" INTEGER,
  "epoch" INTEGER,
  "caption" TEXT,
  "filename" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "storageProvider" TEXT NOT NULL DEFAULT 'local',
  "storageKey" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "runId" UUID NOT NULL,
  "mlProjectId" UUID NOT NULL,
  "projectId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ml_images_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ml_images_runId_step_idx" ON "ml_images"("runId", "step");
CREATE INDEX "ml_images_projectId_createdAt_idx" ON "ml_images"("projectId", "createdAt");
CREATE INDEX "ml_images_mlProjectId_kind_createdAt_idx" ON "ml_images"("mlProjectId", "kind", "createdAt");

ALTER TABLE "ml_images"
  ADD CONSTRAINT "ml_images_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "ml_runs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ml_images"
  ADD CONSTRAINT "ml_images_mlProjectId_fkey"
  FOREIGN KEY ("mlProjectId") REFERENCES "ml_projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ml_images"
  ADD CONSTRAINT "ml_images_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ml_images"
  ADD CONSTRAINT "ml_images_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
