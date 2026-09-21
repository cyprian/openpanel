import { Link } from '@tanstack/react-router';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  FolderIcon,
  MonitorIcon,
  BrainCircuitIcon,
  PlusIcon,
  ServerIcon,
  SmartphoneIcon,
} from 'lucide-react';
import { useId, useState } from 'react';
import { useAppParams } from '@/hooks/use-app-params';
import { useOrganizationAccess } from '@/hooks/use-organization-access';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';

const VISIBLE_PROJECT_COUNT = 5;

const getProjectIcon = (types: string[]) => {
  if (types.includes('ml')) {
    return BrainCircuitIcon;
  }
  if (types.includes('website')) {
    return MonitorIcon;
  }
  if (types.includes('app')) {
    return SmartphoneIcon;
  }
  if (types.includes('backend')) {
    return ServerIcon;
  }
  return FolderIcon;
};

export function SidebarProjects({
  projects,
}: {
  projects: Array<{
    id: string;
    name: string;
    organizationId: string;
    types?: string[];
  }>;
}) {
  const { organizationId, projectId } = useAppParams();
  const { isAdmin } = useOrganizationAccess(organizationId);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const organizationProjects = projects.filter(
    (project) => project.organizationId === organizationId
  );
  const visibleProjects = expanded
    ? organizationProjects
    : organizationProjects.slice(0, VISIBLE_PROJECT_COUNT);

  return (
    <nav aria-label="Projects" className="mb-4 border-border border-b pb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-muted-foreground">Projects</span>
        {isAdmin && (
          <button
            aria-label="Create new project"
            className="rounded-md p-1 text-muted-foreground hover:bg-def-200 hover:text-foreground"
            onClick={() => pushModal('AddProject')}
            title="Create new project"
            type="button"
          >
            <PlusIcon aria-hidden="true" size={16} />
          </button>
        )}
      </div>
      <ul id={listId}>
        {visibleProjects.map((project) => {
          const Icon = getProjectIcon(project.types ?? []);
          const selected = project.id === projectId;

          return (
            <li key={project.id}>
              <Link
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 font-medium text-[13px] transition-colors hover:bg-def-200',
                  selected && 'bg-def-200'
                )}
                params={{ organizationId: project.organizationId, projectId: project.id }}
                title={project.name}
                to={project.types?.includes('ml')
                  ? '/$organizationId/$projectId/ml'
                  : '/$organizationId/$projectId'}
              >
                <Icon aria-hidden="true" className="shrink-0" size={20} />
                <span className="truncate">{project.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {organizationProjects.length === 0 && (
        <p className="px-3 py-2 text-muted-foreground text-sm">No projects yet</p>
      )}
      {organizationProjects.length > VISIBLE_PROJECT_COUNT && (
        <button
          aria-controls={listId}
          aria-expanded={expanded}
          className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] text-muted-foreground hover:bg-def-200 hover:text-foreground"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? <ChevronUpIcon aria-hidden="true" size={20} /> : <ChevronDownIcon aria-hidden="true" size={20} />}
          {expanded ? 'Show less' : `Show more (${organizationProjects.length - VISIBLE_PROJECT_COUNT})`}
        </button>
      )}
    </nav>
  );
}
