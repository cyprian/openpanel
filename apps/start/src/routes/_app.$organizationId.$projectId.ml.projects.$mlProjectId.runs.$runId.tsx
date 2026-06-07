import { MlRunDetail } from '@/components/ml/run-detail';
import { createProjectTitle } from '@/utils/title';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/ml/projects/$mlProjectId/runs/$runId',
)({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle('ML Run') }],
  }),
});

function Component() {
  const { organizationId, projectId, mlProjectId, runId } = Route.useParams();

  return (
    <MlRunDetail
      organizationId={organizationId}
      projectId={projectId}
      runId={runId}
      fallbackMlProjectId={mlProjectId}
    />
  );
}
