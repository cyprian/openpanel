CREATE TABLE "ml_evaluation_rows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sampleId" TEXT,
  "step" INTEGER,
  "epoch" INTEGER,
  "imageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metrics" JSONB NOT NULL DEFAULT '{}',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "runId" UUID NOT NULL,
  "mlProjectId" UUID NOT NULL,
  "projectId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ml_evaluation_rows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ml_evaluation_rows_runId_step_idx" ON "ml_evaluation_rows"("runId", "step");
CREATE INDEX "ml_evaluation_rows_runId_sampleId_idx" ON "ml_evaluation_rows"("runId", "sampleId");
CREATE INDEX "ml_evaluation_rows_projectId_createdAt_idx" ON "ml_evaluation_rows"("projectId", "createdAt");

ALTER TABLE "ml_evaluation_rows"
  ADD CONSTRAINT "ml_evaluation_rows_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "ml_runs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ml_evaluation_rows"
  ADD CONSTRAINT "ml_evaluation_rows_mlProjectId_fkey"
  FOREIGN KEY ("mlProjectId") REFERENCES "ml_projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ml_evaluation_rows"
  ADD CONSTRAINT "ml_evaluation_rows_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ml_evaluation_rows"
  ADD CONSTRAINT "ml_evaluation_rows_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
