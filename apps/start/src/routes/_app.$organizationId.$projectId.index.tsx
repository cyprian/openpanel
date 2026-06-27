import { createFileRoute } from '@tanstack/react-router';
import { NetworkIcon } from 'lucide-react';
import { LazyComponent } from '@/components/lazy-component';
import {
  useMlPageContext,
  useRangePageContext,
} from '@/hooks/use-page-context-helpers';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  OverviewFilterButton,
  OverviewFiltersButtons,
} from '@/components/overview/filters/overview-filters-buttons';
import { OverviewAICommand } from '@/components/overview/overview-ai-command';
import { LiveCounter } from '@/components/overview/live-counter';
import OverviewInsights from '@/components/overview/overview-insights';
import { OverviewInterval } from '@/components/overview/overview-interval';
import OverviewMetrics from '@/components/overview/overview-metrics';
import { OverviewRange } from '@/components/overview/overview-range';
import { OverviewShare } from '@/components/overview/overview-share';
import OverviewTopDevices from '@/components/overview/overview-top-devices';
import OverviewTopEvents from '@/components/overview/overview-top-events';
import OverviewTopGeo from '@/components/overview/overview-top-geo';
import OverviewTopPages from '@/components/overview/overview-top-pages';
import OverviewTopSources from '@/components/overview/overview-top-sources';
import OverviewUserJourney from '@/components/overview/overview-user-journey';
import OverviewWeeklyTrends from '@/components/overview/overview-weekly-trends';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';
import { useTRPC } from '@/integrations/trpc/react';
import { useSuspenseQuery } from '@tanstack/react-query';

export const Route = createFileRoute('/_app/$organizationId/$projectId/')({
  component: ProjectDashboard,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.DASHBOARD),
        },
      ],
    };
  },
});

function ProjectDashboard() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const { data: project } = useSuspenseQuery(
    trpc.project.getProjectWithClients.queryOptions({ projectId }),
  );

  if (project?.types.includes('ml')) {
    return <MlProjectOverview projectName={project.name} />;
  }

  return <AnalyticsProjectOverview projectId={projectId} />;
}

function AnalyticsProjectOverview({ projectId }: { projectId: string }) {
  useRangePageContext('overview');
  return (
    <div>
      <div className="sticky-header -top-px!">
        <div className="col gap-2 p-4">
          <div className="flex justify-between gap-2">
            <div className="flex gap-2">
              <OverviewRange />
              <OverviewInterval />
              <OverviewFilterButton mode="events" />
              <OverviewAICommand className="hidden w-[280px] md:block" />
            </div>
            <div className="flex gap-2">
              <LiveCounter projectId={projectId} />
              <OverviewShare projectId={projectId} />
            </div>
          </div>
          <OverviewFiltersButtons />
        </div>
      </div>
      <div className="grid grid-cols-6 gap-4 p-4 pt-0">
        <OverviewMetrics projectId={projectId} />
        <OverviewInsights projectId={projectId} />
        <OverviewTopSources projectId={projectId} />
        <OverviewTopPages projectId={projectId} />
        <OverviewTopDevices projectId={projectId} />
        <OverviewTopEvents projectId={projectId} />
        <OverviewTopGeo projectId={projectId} />
        <LazyComponent className="col-span-6">
          <OverviewWeeklyTrends projectId={projectId} />
        </LazyComponent>
        <LazyComponent className="col-span-6">
          <OverviewUserJourney projectId={projectId} />
        </LazyComponent>
      </div>
    </div>
  );
}

function MlProjectOverview({ projectName }: { projectName: string }) {
  useMlPageContext('mlProjects', undefined, {
    projectName,
  });

  return (
    <PageContainer>
      <PageHeader
        title={projectName}
        description="ML experiment tracking"
        className="mb-8"
      />
      <div className="rounded-md border bg-card p-8">
        <div className="flex items-center gap-3">
          <div className="center-center size-10 rounded-md bg-def-200">
            <NetworkIcon className="size-5" />
          </div>
          <div>
            <div className="font-medium">ML project</div>
            <div className="text-muted-foreground text-sm">
              Runs, metrics, images, and artifacts will live here.
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
