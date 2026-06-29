import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import type { IServiceProject } from '@openpanel/db';

import { cn } from '@/utils/cn';
import { formatDistanceToNow } from 'date-fns';
import {
  NetworkIcon,
  SettingsIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react';
import { FadeIn } from '../fade-in';
import { MlStatusBadge } from '../ml/status-badge';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Skeleton } from '../skeleton';
import { LinkButton } from '../ui/button';
import { ProjectChart } from './project-chart';

export function ProjectCardRoot({
  children,
  className,
}: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'relative card hover:-translate-y-px hover:shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ProjectCardSkeleton() {
  return (
    <ProjectCardRoot className="aspect-[340/116.25] p-4 col">
      <Skeleton className="h-5 w-full" />
      <div className="row mt-auto gap-4 w-1/2 ml-auto">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
      </div>
    </ProjectCardRoot>
  );
}

function ProjectCard({
  id,
  domain,
  name,
  organizationId,
  types,
}: IServiceProject) {
  const isMlProject = types.includes('ml');

  return (
    <ProjectCardRoot>
      <Link
        to={
          isMlProject
            ? '/$organizationId/$projectId/ml'
            : '/$organizationId/$projectId'
        }
        params={{
          organizationId,
          projectId: id,
        }}
        className="col p-4 transition-transform"
      >
        <div className="font-medium flex items-center gap-2 text-lg pb-2">
          <div className="row gap-2 flex-1">
            {domain && <SerieIcon name={domain ?? ''} />}
            {name}
          </div>
        </div>
        <div
          className={cn(
            '-mx-4 mb-4',
            isMlProject ? 'min-h-32' : 'aspect-[8/1]',
          )}
        >
          {isMlProject ? (
            <ProjectMlPreview projectId={id} />
          ) : (
            <ProjectChartOuter id={id} />
          )}
        </div>
        <div className="flex flex-1 gap-4 h-9 md:h-4">
          {isMlProject ? <ProjectMlMetrics /> : <ProjectMetrics id={id} />}
        </div>
      </Link>
      <LinkButton
        variant="ghost"
        href={`/${organizationId}/${id}/settings`}
        className="text-muted-foreground absolute top-2 right-2"
      >
        <SettingsIcon size={16} />
      </LinkButton>
    </ProjectCardRoot>
  );
}

function ProjectMlPreview({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const runs = useQuery(
    trpc.ml.runs.queryOptions({
      projectId,
      limit: 3,
    }),
  );
  const latestRuns = runs.data ?? [];

  return (
    <div className="h-full border-y bg-def-100 px-4 py-3">
      <div className="row gap-2 text-muted-foreground text-sm">
        <NetworkIcon className="size-4" />
        <span className="font-medium">Latest experiments</span>
      </div>
      {runs.isLoading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-3/5" />
        </div>
      ) : latestRuns.length > 0 ? (
        <div className="mt-2 space-y-2">
          {latestRuns.map((run) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm"
              key={run.id}
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{run.name}</div>
                <div className="truncate text-muted-foreground text-xs">
                  {run.mlProject.name}
                </div>
              </div>
              <div className="row gap-2">
                <MlStatusBadge className="text-[10px]" status={run.status} />
                <span className="hidden whitespace-nowrap text-muted-foreground text-xs sm:inline">
                  {formatDistanceToNow(run.updatedAt, { addSuffix: true })}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 text-muted-foreground text-sm">
          No experiments yet
        </div>
      )}
    </div>
  );
}

function ProjectChartOuter({ id }: { id: string }) {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.chart.projectCard.queryOptions({
      projectId: id,
    }),
  );

  return (
    <FadeIn className="h-full w-full">
      <ProjectChart data={data?.chart || []} color={'blue'} />
    </FadeIn>
  );
}

function Metric({ value, label, className }: { value: React.ReactNode; label: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1 md:flex-row items-center text-sm", className)}>
      <div className="text-muted-foreground">{label}</div>
      <span className="font-medium whitespace-nowrap">{value}</span>
    </div>
  );
}

function ProjectMlMetrics() {
  return (
    <FadeIn className="row flex-wrap gap-3 flex-1">
      <Metric label="Type" value="ML" />
      <Metric label="Artifacts" value="Local-first" className="ml-auto" />
    </FadeIn>
  );
}

function ProjectMetrics({ id }: { id: string }) {
  const number = useNumber();
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.chart.projectCard.queryOptions({
      projectId: id,
    }),
  );

  return (
    <FadeIn className="row flex-wrap gap-3 flex-1">
        {typeof data?.trend?.percentage === 'number' && (
          <Metric
            label="3M DIFF"
            value={
              <span
                className={cn(
                  'font-semibold',
                  'row gap-1 items-center',
                  data?.trend?.direction === 'up'
                    ? 'text-emerald-300'
                    : data?.trend?.direction === 'down'
                      ? 'text-orange-300'
                      : 'text-muted-foreground',
                )}
              >
                {data.trend.direction === 'up' && (
                  <TrendingUpIcon className="size-4" />
                )}
                {data.trend.direction === 'down' && (
                  <TrendingDownIcon className="size-4" />
                )}
                {Math.abs(data.trend.percentage)}%
              </span>
            }
          />
        )}
        {!!data?.metrics?.revenue && (
          <Metric
            label="Revenue"
            value={number.currency(data?.metrics?.revenue / 100, {
              short: true,
            })}
          />
        )}
      <Metric label="3M" value={number.short(data?.metrics?.months_3 ?? 0)} className="ml-auto" />
        <Metric label="30D" value={number.short(data?.metrics?.month ?? 0)} />
        <Metric label="24H" value={number.short(data?.metrics?.day ?? 0)} />
    </FadeIn>
  );
}

export default ProjectCard;
